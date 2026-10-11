-- 024: Flutterwave as the payment PROVIDER behind the existing money system.
--
-- Design: payments, the append-only ledger, commission rules, payouts and refunds (008, 009, 013, 016) stay the single
-- source of truth. Flutterwave collects the money (hosted checkout: M-Pesa + card), pays kitchens out through Transfers,
-- and refunds through its refund API. This migration replaces the parallel, never-connected structures from 022/023
-- (kitchen_ledgers, fw_payment_intents, commission settings) which would have created a second ledger and double payouts.

-- =====================================================================
-- 1. Remove the parallel structures from 022/023
-- =====================================================================
drop view  if exists public.kitchen_pending_balances;
drop table if exists public.kitchen_ledgers cascade;
drop type  if exists public.payout_ledger_status;
drop table if exists public.fw_payment_intents cascade;
-- Commission lives ONLY in commission_rules (versioned, audited, per-kitchen overrides).
delete from public.platform_settings where key in ('global_commission_percentage', 'mpesa_entry_fee_percent');

-- =====================================================================
-- 2. Payments: provider-neutral columns
-- =====================================================================
alter table public.payments
  add column if not exists provider_tx_id text,   -- Flutterwave transaction id (needed to verify and refund)
  add column if not exists checkout_url  text;    -- hosted payment page, so an abandoned checkout can be resumed
create unique index if not exists payments_provider_tx_unique on public.payments (provider, provider_tx_id) where provider_tx_id is not null;

-- begin_payment (013) creates the row as provider 'mpesa'. Hosted checkout re-labels it and stores the tx_ref the webhook will quote.
create or replace function public.attach_checkout(p_payment uuid, p_tx_ref text, p_link text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set provider = 'flutterwave', status = 'STK_SENT', checkout_request_id = p_tx_ref, checkout_url = p_link
   where id = p_payment and status = 'INITIATED';
$$;

-- Same logic as 016, but payment events are recorded under the payment's own provider and the Flutterwave
-- transaction id is stored (it is what refunds need).
create or replace function public.record_payment_success(
  p_checkout_request_id text, p_receipt text, p_amount_minor bigint, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype; v_order public.orders%rowtype; v_rule public.commission_rules%rowtype;
  v_commission bigint := 0; v_event_id bigint; v_prov text;
  v_type text := case when p_receipt is null then 'query_success' else 'callback_success' end;
begin
  select provider into v_prov from public.payments where checkout_request_id = p_checkout_request_id;
  insert into public.payment_events (provider, external_id, event_type, payload)
  values (coalesce(v_prov, 'mpesa'), p_checkout_request_id, v_type, p_raw)
  on conflict (provider, external_id, event_type) do nothing
  returning id into v_event_id;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if p_raw ? 'provider_tx_id' and v_pay.provider_tx_id is null then
    update public.payments set provider_tx_id = p_raw ->> 'provider_tx_id' where id = v_pay.id;
  end if;
  if v_pay.status = 'SUCCEEDED' then
    if v_pay.receipt_pending and p_receipt is not null then
      update public.payments set provider_receipt = p_receipt, receipt_pending = false where id = v_pay.id;
    end if;
    return v_pay.id;
  end if;

  if p_amount_minor <> v_pay.amount_minor then
    update public.payments set status = 'FAILED', result_desc = 'amount_mismatch', needs_refund = true, provider_receipt = p_receipt where id = v_pay.id;
    update public.payment_events set payment_id = v_pay.id, tenant_id = v_pay.tenant_id, processed_at = now() where id = v_event_id;
    return v_pay.id;
  end if;

  select * into v_order from public.orders where id = v_pay.order_id for update;
  update public.payments set status = 'SUCCEEDED', provider_receipt = p_receipt, receipt_pending = (p_receipt is null),
         result_code = 0, completed_at = now() where id = v_pay.id;

  if v_order.status not in ('PENDING_PAYMENT','PAYMENT_FAILED') then
    update public.payments set needs_refund = true where id = v_pay.id;
    update public.payment_events set payment_id = v_pay.id, tenant_id = v_order.tenant_id, processed_at = now() where id = v_event_id;
    return v_pay.id;
  end if;

  select * into v_rule from private.resolve_commission_rule(v_order.tenant_id, now());
  if v_rule.enabled then
    v_commission := least(v_order.total_minor, round(v_order.total_minor * v_rule.percent_bps / 10000.0)::bigint + v_rule.fixed_minor);
  end if;
  update public.orders set commission_rule_id = v_rule.id, commission_enabled = v_rule.enabled,
    commission_percent_bps = v_rule.percent_bps, commission_fixed_minor = v_rule.fixed_minor,
    commission_minor = v_commission, kitchen_net_minor = v_order.total_minor - v_commission, paid_at = now()
  where id = v_order.id;

  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, payment_id, commission_rule_id, description)
  values (v_order.tenant_id, 'sale', v_order.total_minor, v_order.currency, v_order.id, v_pay.id, v_rule.id, 'Order payment received');
  if v_commission > 0 then
    insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, payment_id, commission_rule_id, description)
    values (v_order.tenant_id, 'commission', -v_commission, v_order.currency, v_order.id, v_pay.id, v_rule.id, 'Platform commission');
  end if;
  perform private.apply_transition(v_order.id, 'PAID', null, 'system', 'Payment confirmed');
  perform private.apply_transition(v_order.id, 'RECEIVED', null, 'system', null);
  update public.payment_events set payment_id = v_pay.id, tenant_id = v_order.tenant_id, processed_at = now() where id = v_event_id;
  return v_pay.id;
end $$;
revoke all on function public.record_payment_success(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_success(text, text, bigint, jsonb) to service_role;

create or replace function public.record_payment_failure(
  p_checkout_request_id text, p_status public.payment_status, p_result_code int, p_result_desc text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments%rowtype; v_status public.order_status; v_prov text;
begin
  if p_status not in ('FAILED','CANCELLED_BY_USER','TIMEOUT') then
    raise exception 'invalid_failure_status' using errcode = 'P0001'; end if;
  select provider into v_prov from public.payments where checkout_request_id = p_checkout_request_id;
  insert into public.payment_events (provider, external_id, event_type, payload)
  values (coalesce(v_prov, 'mpesa'), p_checkout_request_id, 'callback_failure', p_raw)
  on conflict (provider, external_id, event_type) do nothing;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found or v_pay.status in ('SUCCEEDED','FAILED','CANCELLED_BY_USER','TIMEOUT') then return; end if;

  update public.payments set status = p_status, result_code = p_result_code,
         result_desc = left(p_result_desc, 300), completed_at = now() where id = v_pay.id;
  select status into v_status from public.orders where id = v_pay.order_id;
  if v_status = 'PENDING_PAYMENT' then
    perform private.apply_transition(v_pay.order_id, 'PAYMENT_FAILED', null, 'system', left(p_result_desc, 300));
  end if;
end $$;
revoke all on function public.record_payment_failure(text, public.payment_status, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_failure(text, public.payment_status, int, text, jsonb) to service_role;

revoke all on function public.attach_checkout(uuid, text, text) from public, anon, authenticated;
grant execute on function public.attach_checkout(uuid, text, text) to service_role;

-- =====================================================================
-- 3. Refunds through Flutterwave
-- =====================================================================
alter table public.refunds drop constraint if exists refunds_method_check;
alter table public.refunds add constraint refunds_method_check check (method in ('mpesa_reversal', 'flutterwave', 'manual'));

create or replace function public.mark_refund_provider(p_refund uuid, p_method text)
returns void language sql security definer set search_path = '' as $$
  update public.refunds set method = p_method where id = p_refund and status = 'processing' and p_method in ('mpesa_reversal','flutterwave');
$$;
revoke all on function public.mark_refund_provider(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_refund_provider(uuid, text) to service_role;

-- =====================================================================
-- 4. Payouts through Flutterwave Transfers (+ optional automatic payouts)
-- =====================================================================
-- Same as begin_b2c_payout (016) without the platform-admin check, for the scheduled worker only (service role).
create or replace function public.begin_fw_payout(p_payout uuid)
returns table (originator_id text, msisdn text, amount_minor bigint, tenant_id uuid, account_name text)
language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype; v_acct public.payout_accounts%rowtype; v_orig text;
begin
  select * into v_p from public.payouts where id = p_payout for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.method <> 'mpesa_b2c' or v_p.status <> 'pending' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  select * into v_acct from public.payout_accounts a where a.tenant_id = v_p.tenant_id and a.status = 'approved';
  if not found then raise exception 'no_payout_account' using errcode = 'P0001'; end if;
  v_orig := gen_random_uuid()::text;
  update public.payouts set status = 'processing', originator_conversation_id = v_orig, destination_msisdn = v_acct.msisdn, sent_at = now() where id = p_payout;
  perform private.write_audit(v_p.tenant_id, 'payout.fw_sent', 'payout', p_payout, jsonb_build_object('msisdn_last4', right(v_acct.msisdn, 4)));
  return query select v_orig, v_acct.msisdn, v_p.amount_minor, v_p.tenant_id, v_acct.account_name;
end $$;

-- Which accounts the manual admin flow returns the account holder for (begin_b2c_payout does not).
create or replace function public.payout_account_name(p_tenant uuid)
returns text language sql security definer stable set search_path = '' as $$
  select account_name from public.payout_accounts where tenant_id = p_tenant and status = 'approved';
$$;

-- Creates (does not send) payouts for every kitchen with an APPROVED payout account whose unpaid balance qualifies:
--   normal run: balance >= min_payout_minor (default KES 500);  Friday flush: balance >= payout_flush_floor_minor (default KES 100).
-- Off unless platform_settings.auto_payouts_enabled = true. Amounts are rounded down to whole shillings.
create or replace function public.run_auto_payouts(p_flush boolean default false)
returns table (o_payout_id uuid, o_tenant_id uuid, o_amount_minor bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean := coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = 'auto_payouts_enabled'), false);
  v_min bigint := coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = 'min_payout_minor'), 50000);
  v_floor bigint := coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = 'payout_flush_floor_minor'), 10000);
  r record; v_bal bigint; v_amt bigint; v_id uuid; v_need bigint;
begin
  if not v_enabled then return; end if;
  v_need := case when p_flush then v_floor else v_min end;
  for r in select t.id as tid, t.currency as cur from public.tenants t
            where exists (select 1 from public.payout_accounts a where a.tenant_id = t.id and a.status = 'approved') loop
    perform 1 from public.tenants where id = r.tid for update;   -- serialise per kitchen
    select coalesce(sum(le.amount_minor), 0) into v_bal from public.ledger_entries le where le.tenant_id = r.tid;
    v_bal := v_bal - coalesce((select sum(p.amount_minor) from public.payouts p where p.tenant_id = r.tid and p.status in ('pending', 'processing')), 0);
    v_amt := (v_bal / 100) * 100;
    if v_amt >= v_need then
      insert into public.payouts (tenant_id, amount_minor, currency, method, note)
      values (r.tid, v_amt, r.cur, 'mpesa_b2c', case when p_flush then 'Weekly automatic payout' else 'Automatic payout (minimum reached)' end)
      returning id into v_id;
      o_payout_id := v_id; o_tenant_id := r.tid; o_amount_minor := v_amt; return next;
    end if;
  end loop;
end $$;

insert into public.platform_settings (key, value) values
  ('auto_payouts_enabled', 'false'::jsonb),
  ('min_payout_minor', '50000'::jsonb),
  ('payout_flush_floor_minor', '10000'::jsonb)
on conflict (key) do nothing;

revoke all on function public.begin_fw_payout(uuid), public.payout_account_name(uuid), public.run_auto_payouts(boolean) from public, anon, authenticated;
grant execute on function public.begin_fw_payout(uuid), public.payout_account_name(uuid), public.run_auto_payouts(boolean) to service_role;

-- =====================================================================
-- 5. Hardening found while testing: Supabase grants EXECUTE on new functions to anon by default; 017 only revoked PUBLIC.
--    The function rejects unauthenticated callers itself, but anon should not be able to call it at all.
-- =====================================================================
revoke execute on function public.claim_platform_ownership() from anon;
