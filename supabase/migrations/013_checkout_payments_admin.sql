-- 013: checkout/payment initiation, refunds, expiry, staff + admin RPCs, hardening

-- ---------- M-Pesa needs whole shillings ----------
alter table public.products add constraint products_whole_currency check (price_minor % 100 = 0);
alter table public.product_options add constraint product_options_whole_currency check (price_delta_minor % 100 = 0);
alter table public.tenants add constraint tenants_fee_whole_currency check (delivery_fee_minor % 100 = 0 and min_order_minor % 100 = 0);

-- ---------- Extra transitions + payment flags ----------
insert into public.order_transitions (from_status, to_status, permission_key, allow_customer, system_only) values
  ('PAYMENT_FAILED','EXPIRED',null,false,true),
  ('PAYMENT_FAILED','CANCELLED',null,true,false),
  ('PAYMENT_FAILED','PAID',null,false,true);   -- late success after a timeout

alter table public.payments
  add column needs_refund boolean not null default false,
  add column refund_reference text,
  add column refunded_at timestamptz;
create index payments_needs_refund on public.payments (created_at) where needs_refund;
create index payments_reconcile on public.payments (created_at) where status in ('INITIATED','STK_SENT');

-- ---------- Payment initiation (service role only; called by the mpesa-stk-push Edge Function) ----------
create or replace function public.begin_payment(p_order uuid, p_user uuid, p_msisdn text, p_idempotency_key text)
returns table (pay_id uuid, pay_amount_minor bigint, pay_tenant_id uuid, pay_order_number bigint)
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_owner uuid; v_attempts int; v_existing public.payments%rowtype; v_pay uuid;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select user_id into v_owner from public.kitchen_customers where id = v_order.kitchen_customer_id and tenant_id = v_order.tenant_id;
  if v_owner is distinct from p_user then raise exception 'permission_denied' using errcode = '42501'; end if;

  -- Same idempotency key = same attempt (double click / retry of the same request).
  select * into v_existing from public.payments where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id <> p_order then raise exception 'idempotency_conflict' using errcode = 'P0001'; end if;
    return query select v_existing.id, v_existing.amount_minor, v_existing.tenant_id, v_order.order_number; return;
  end if;

  if v_order.status = 'PAYMENT_FAILED' then
    perform private.apply_transition(p_order, 'PENDING_PAYMENT', p_user, 'system', 'Payment retry');
  elsif v_order.status <> 'PENDING_PAYMENT' then
    raise exception 'order_not_payable' using errcode = 'P0001';
  end if;
  if v_order.total_minor % 100 <> 0 or v_order.total_minor < 100 then
    raise exception 'amount_not_whole_shillings' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payments where order_id = p_order and status in ('INITIATED','STK_SENT')) then
    raise exception 'payment_in_progress' using errcode = 'P0001'; end if;
  select count(*) into v_attempts from public.payments where order_id = p_order;
  if v_attempts >= 5 then raise exception 'too_many_attempts' using errcode = 'P0001'; end if;

  insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key)
  values (v_order.tenant_id, p_order, v_order.kitchen_customer_id, v_order.total_minor, v_order.currency, p_msisdn, p_idempotency_key)
  returning id into v_pay;
  return query select v_pay, v_order.total_minor, v_order.tenant_id, v_order.order_number;
end $$;

create or replace function public.attach_stk_response(p_payment uuid, p_merchant_request_id text, p_checkout_request_id text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set status = 'STK_SENT', merchant_request_id = p_merchant_request_id,
         checkout_request_id = p_checkout_request_id
  where id = p_payment and status = 'INITIATED';
$$;

-- Daraja rejected the request before any prompt was sent: the order stays payable.
create or replace function public.fail_payment_initiation(p_payment uuid, p_desc text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set status = 'FAILED', result_desc = left(p_desc, 300), completed_at = now()
  where id = p_payment and status = 'INITIATED';
$$;

-- Replaces the 008 version: handles late/duplicate success for orders that can no longer be fulfilled.
create or replace function public.record_payment_success(
  p_checkout_request_id text, p_receipt text, p_amount_minor bigint, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype; v_order public.orders%rowtype; v_rule public.commission_rules%rowtype;
  v_commission bigint := 0; v_event_id bigint;
begin
  insert into public.payment_events (provider, external_id, event_type, payload)
  values ('mpesa', p_checkout_request_id, 'callback_success', p_raw)
  on conflict (provider, external_id, event_type) do nothing
  returning id into v_event_id;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if v_pay.status = 'SUCCEEDED' then return v_pay.id; end if;

  if p_amount_minor <> v_pay.amount_minor then
    -- Do not raise: an exception would roll back this flag. Money arrived, so queue it for manual review/refund.
    update public.payments set status = 'FAILED', result_desc = 'amount_mismatch', needs_refund = true,
           provider_receipt = p_receipt where id = v_pay.id;
    update public.payment_events set payment_id = v_pay.id, tenant_id = v_pay.tenant_id, processed_at = now() where id = v_event_id;
    return v_pay.id;
  end if;

  select * into v_order from public.orders where id = v_pay.order_id for update;
  update public.payments set status = 'SUCCEEDED', provider_receipt = p_receipt, result_code = 0, completed_at = now()
   where id = v_pay.id;

  -- Money arrived but the order can no longer be fulfilled (expired/cancelled while the prompt was open).
  if v_order.status not in ('PENDING_PAYMENT','PAYMENT_FAILED') then
    update public.payments set needs_refund = true where id = v_pay.id;
    update public.payment_events set payment_id = v_pay.id, tenant_id = v_order.tenant_id, processed_at = now() where id = v_event_id;
    return v_pay.id;
  end if;

  select * into v_rule from private.resolve_commission_rule(v_order.tenant_id, now());
  if v_rule.enabled then
    v_commission := least(v_order.total_minor,
        round(v_order.total_minor * v_rule.percent_bps / 10000.0)::bigint + v_rule.fixed_minor);
  end if;
  update public.orders set
    commission_rule_id = v_rule.id, commission_enabled = v_rule.enabled,
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

-- Failure callbacks must not downgrade an order whose success we already recorded.
create or replace function public.record_payment_failure(
  p_checkout_request_id text, p_status public.payment_status, p_result_code int, p_result_desc text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments%rowtype; v_status public.order_status;
begin
  if p_status not in ('FAILED','CANCELLED_BY_USER','TIMEOUT') then
    raise exception 'invalid_failure_status' using errcode = 'P0001'; end if;
  insert into public.payment_events (provider, external_id, event_type, payload)
  values ('mpesa', p_checkout_request_id, 'callback_failure', p_raw)
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

-- Scheduled by payment-reconcile: unpaid orders older than the window become EXPIRED.
create or replace function public.expire_stale_orders(p_minutes int default 30)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select o.id from public.orders o
           where o.status in ('PENDING_PAYMENT','PAYMENT_FAILED') and o.created_at < now() - make_interval(mins => p_minutes)
             and not exists (select 1 from public.payments p where p.order_id = o.id and p.status in ('INITIATED','STK_SENT'))
           for update skip locked loop
    perform private.apply_transition(r.id, 'EXPIRED', null, 'system', 'Payment window closed');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Refunds (platform admin records the refund; M-Pesa reversal itself is done outside the app) ----------
create or replace function public.refund_order(p_order uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.orders%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status not in ('CANCELLED','REJECTED') or v_o.paid_at is null then
    raise exception 'order_not_refundable' using errcode = 'P0001'; end if;
  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, description, created_by)
  values (v_o.tenant_id, 'refund', -v_o.total_minor, v_o.currency, v_o.id, 'Refund to customer: ' || coalesce(p_reference,''), auth.uid());
  if coalesce(v_o.commission_minor, 0) > 0 then
    insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, description, created_by)
    values (v_o.tenant_id, 'commission_reversal', v_o.commission_minor, v_o.currency, v_o.id, 'Commission reversed on refund', auth.uid());
  end if;
  perform private.apply_transition(p_order, 'REFUNDED', auth.uid(), 'staff', p_reference);
  perform private.write_audit(v_o.tenant_id, 'order.refunded', 'order', p_order, jsonb_build_object('reference', p_reference));
end $$;

create or replace function public.resolve_payment_refund(p_payment uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.payments set needs_refund = false, refund_reference = p_reference, refunded_at = now()
   where id = p_payment and needs_refund returning tenant_id into v_t;
  if v_t is null then raise exception 'nothing_to_refund' using errcode = 'P0001'; end if;
  perform private.write_audit(v_t, 'payment.refunded', 'payment', p_payment, jsonb_build_object('reference', p_reference));
end $$;

-- ---------- Staff / subscription / customers ----------
create or replace function public.list_staff(p_tenant uuid)
returns table (member_id uuid, user_id uuid, email text, full_name text, role_key text, is_active boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.user_id, u.email::text, p.full_name, m.role_key, m.is_active, m.created_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.tenant_id = p_tenant and private.has_permission(p_tenant, 'staff.view')
  order by m.created_at;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  select tenant_id into v_t from public.tenant_invitations where id = p_invitation;
  if v_t is null or not private.has_permission(v_t, 'staff.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.tenant_invitations set status = 'revoked' where id = p_invitation and status = 'pending';
  perform private.write_audit(v_t, 'staff.invite_revoked', 'tenant_invitation', p_invitation);
end $$;

create or replace function public.change_subscription(p_tenant uuid, p_plan text, p_status public.subscription_status default 'active')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.subscriptions set status = 'cancelled', cancelled_at = now()
   where tenant_id = p_tenant and status in ('trialing','active','past_due');
  insert into public.subscriptions (tenant_id, plan_key, status, current_period_end)
  values (p_tenant, p_plan, p_status, now() + interval '1 month');
  perform private.write_audit(p_tenant, 'subscription.changed', 'tenant', p_tenant, jsonb_build_object('plan', p_plan, 'status', p_status));
end $$;

create view public.customer_stats with (security_invoker = true) as
select kc.tenant_id, kc.id as kitchen_customer_id,
  count(o.id) filter (where o.paid_at is not null) as paid_orders,
  coalesce(sum(o.total_minor) filter (where o.paid_at is not null and o.status not in ('REFUNDED')), 0) as total_spent_minor,
  max(o.created_at) as last_order_at
from public.kitchen_customers kc
left join public.orders o on o.tenant_id = kc.tenant_id and o.kitchen_customer_id = kc.id
group by kc.tenant_id, kc.id;
grant select on public.customer_stats to authenticated;

grant update (needs_refund) on public.payments to service_role;

-- ---------- Hardening ----------
-- Default privileges give anon/authenticated EXECUTE on public functions. Tighten:
revoke execute on all functions in schema public from anon;
grant execute on function public.resolve_tenant(text), public.tenant_entitlements(uuid) to anon;
-- Service-only functions
revoke execute on function public.begin_payment(uuid, uuid, text, text), public.attach_stk_response(uuid, text, text),
  public.fail_payment_initiation(uuid, text), public.expire_stale_orders(int) from public, anon, authenticated;
grant execute on function public.begin_payment(uuid, uuid, text, text), public.attach_stk_response(uuid, text, text),
  public.fail_payment_initiation(uuid, text), public.expire_stale_orders(int) to service_role;
revoke execute on function public.refund_order(uuid, text), public.resolve_payment_refund(uuid, text),
  public.list_staff(uuid), public.revoke_invitation(uuid), public.change_subscription(uuid, text, public.subscription_status) from public, anon;
grant execute on function public.refund_order(uuid, text), public.resolve_payment_refund(uuid, text),
  public.list_staff(uuid), public.revoke_invitation(uuid), public.change_subscription(uuid, text, public.subscription_status) to authenticated;
-- Internal helpers must not be callable from the API (they bypass authorisation or forge records).
revoke execute on function private.write_audit(uuid, text, text, anyelement, jsonb) from public, anon, authenticated;
revoke execute on function private.notify_order_change(uuid, uuid, uuid, bigint, public.order_status) from public, anon, authenticated;
revoke execute on function private.resolve_commission_rule(uuid, timestamptz) from public, anon, authenticated;
