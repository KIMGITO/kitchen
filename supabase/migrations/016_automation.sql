-- 016: rate limiting, notification delivery queue, payout accounts + B2C payouts, M-Pesa reversal refunds, receipt backfill

-- =====================================================================
-- 1. Rate limiting (fixed window, database-backed)
-- =====================================================================
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function private.rate_check(p_key text, p_limit int, p_window_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if v_hits > p_limit then raise exception 'rate_limited' using errcode = 'P0001'; end if;
end $$;
revoke all on function private.rate_check(text, int, int) from public, anon, authenticated;

create or replace function public.prune_rate_limits() returns int language sql security definer set search_path = '' as $$
  with d as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1) select count(*)::int from d;
$$;
revoke all on function public.prune_rate_limits() from public, anon, authenticated;
grant execute on function public.prune_rate_limits() to service_role;

-- Wrap existing entry points: move the implementation to `private`, expose a rate-limited wrapper under the same public name.
alter function public.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) set schema private;
alter function private.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) rename to create_order_impl;
revoke all on function private.create_order_impl(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) from public, anon, authenticated;
create function public.create_order(p_tenant uuid, p_items jsonb, p_fulfilment public.fulfilment_type, p_address uuid default null,
  p_contact_name text default null, p_contact_phone text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.rate_check('order:' || coalesce(auth.uid()::text, 'anon') || ':' || p_tenant, 8, 300);
  return private.create_order_impl(p_tenant, p_items, p_fulfilment, p_address, p_contact_name, p_contact_phone, p_notes);
end $$;
revoke all on function public.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) from public, anon;
grant execute on function public.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) to authenticated;

alter function public.register_kitchen_customer(uuid, text, text) set schema private;
alter function private.register_kitchen_customer(uuid, text, text) rename to register_kitchen_customer_impl;
revoke all on function private.register_kitchen_customer_impl(uuid, text, text) from public, anon, authenticated;
create function public.register_kitchen_customer(p_tenant uuid, p_full_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.rate_check('regcust:' || coalesce(auth.uid()::text, 'anon'), 10, 3600);
  return private.register_kitchen_customer_impl(p_tenant, p_full_name, p_phone);
end $$;
revoke all on function public.register_kitchen_customer(uuid, text, text) from public, anon;
grant execute on function public.register_kitchen_customer(uuid, text, text) to authenticated;

alter function public.register_kitchen(text, text) set schema private;
alter function private.register_kitchen(text, text) rename to register_kitchen_impl;
revoke all on function private.register_kitchen_impl(text, text) from public, anon, authenticated;
create function public.register_kitchen(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform private.rate_check('regkitchen:' || coalesce(auth.uid()::text, 'anon'), 3, 86400);
  return private.register_kitchen_impl(p_slug, p_name);
end $$;
revoke all on function public.register_kitchen(text, text) from public, anon;
grant execute on function public.register_kitchen(text, text) to authenticated;

alter function public.invite_staff(uuid, text, text) set schema private;
alter function private.invite_staff(uuid, text, text) rename to invite_staff_impl;
revoke all on function private.invite_staff_impl(uuid, text, text) from public, anon, authenticated;
create function public.invite_staff(p_tenant uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform private.rate_check('invite:' || coalesce(auth.uid()::text, 'anon') || ':' || p_tenant, 20, 3600);
  return private.invite_staff_impl(p_tenant, p_email, p_role);
end $$;
revoke all on function public.invite_staff(uuid, text, text) from public, anon;
grant execute on function public.invite_staff(uuid, text, text) to authenticated;

alter function public.begin_payment(uuid, uuid, text, text) set schema private;
alter function private.begin_payment(uuid, uuid, text, text) rename to begin_payment_impl;
revoke all on function private.begin_payment_impl(uuid, uuid, text, text) from public, anon, authenticated;
create function public.begin_payment(p_order uuid, p_user uuid, p_msisdn text, p_idempotency_key text)
returns table (pay_id uuid, pay_amount_minor bigint, pay_tenant_id uuid, pay_order_number bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.rate_check('pay:' || p_user, 12, 600);
  return query select * from private.begin_payment_impl(p_order, p_user, p_msisdn, p_idempotency_key);
end $$;
revoke all on function public.begin_payment(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_payment(uuid, uuid, text, text) to service_role;

-- =====================================================================
-- 2. Missed callbacks: receipt backfill
-- =====================================================================
alter table public.payments add column receipt_pending boolean not null default false;

create or replace function public.record_payment_success(
  p_checkout_request_id text, p_receipt text, p_amount_minor bigint, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype; v_order public.orders%rowtype; v_rule public.commission_rules%rowtype;
  v_commission bigint := 0; v_event_id bigint;
  v_type text := case when p_receipt is null then 'query_success' else 'callback_success' end;
begin
  insert into public.payment_events (provider, external_id, event_type, payload)
  values ('mpesa', p_checkout_request_id, v_type, p_raw)
  on conflict (provider, external_id, event_type) do nothing
  returning id into v_event_id;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if v_pay.status = 'SUCCEEDED' then
    -- A late genuine callback fills in a receipt that a status query could not provide.
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

create or replace function public.set_payment_receipt(p_payment uuid, p_receipt text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if length(trim(coalesce(p_receipt, ''))) < 8 then raise exception 'invalid_receipt' using errcode = 'P0001'; end if;
  update public.payments set provider_receipt = upper(trim(p_receipt)), receipt_pending = false
   where id = p_payment and receipt_pending returning tenant_id into v_t;
  if v_t is null then raise exception 'nothing_to_update' using errcode = 'P0001'; end if;
  perform private.write_audit(v_t, 'payment.receipt_set', 'payment', p_payment, jsonb_build_object('receipt', upper(trim(p_receipt))));
end $$;
revoke all on function public.set_payment_receipt(uuid, text) from public, anon;
grant execute on function public.set_payment_receipt(uuid, text) to authenticated;

-- =====================================================================
-- 3. Notification delivery (email + SMS) queue
-- =====================================================================
insert into public.platform_settings (key, value) values ('sms_daily_cap_per_kitchen', '200') on conflict do nothing;

create table public.tenant_notification_settings (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  customer_email     boolean not null default true,
  customer_sms       boolean not null default false,   -- needs the advanced_notifications feature
  kitchen_email      boolean not null default true,
  kitchen_sms        boolean not null default false,   -- needs the advanced_notifications feature
  kitchen_alert_phone text,
  updated_at         timestamptz not null default now()
);
create trigger tns_updated_at before update on public.tenant_notification_settings for each row execute function private.set_updated_at();

create table public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('email','sms')),
  to_address      text not null,
  subject         text,
  body            text not null,
  status          text not null default 'queued' check (status in ('queued','sending','sent','failed')),
  attempts        int not null default 0,
  last_error      text,
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index notification_deliveries_work on public.notification_deliveries (next_attempt_at) where status in ('queued','sending');
create index notification_deliveries_tenant_day on public.notification_deliveries (tenant_id, channel, created_at);

create or replace function private.enqueue_deliveries() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants%rowtype; v_host text; v_proto text; v_link text; v_cap int; v_today int;
  v_c_email boolean; v_c_sms boolean; v_k_email boolean; v_k_sms boolean; v_phone text;
  v_email text; v_cphone text; v_sms_ok boolean;
begin
  begin  -- delivery problems must never break order or payment processing
    select * into t from public.tenants where id = new.tenant_id;
    select customer_email, customer_sms, kitchen_email, kitchen_sms, kitchen_alert_phone
      into v_c_email, v_c_sms, v_k_email, v_k_sms, v_phone
      from public.tenant_notification_settings where tenant_id = new.tenant_id;
    if not found then v_c_email := true; v_c_sms := false; v_k_email := true; v_k_sms := false; v_phone := null; end if;

    select hostname into v_host from public.tenant_domains where tenant_id = new.tenant_id and is_primary limit 1;
    v_proto := case when v_host is null or v_host like 'localhost%' or v_host like '%.localhost%' then 'http' else 'https' end;
    select coalesce((select (value #>> '{}')::int from public.platform_settings where key = 'sms_daily_cap_per_kitchen'), 200) into v_cap;
    select count(*) into v_today from public.notification_deliveries where tenant_id = new.tenant_id and channel = 'sms' and created_at > now() - interval '1 day';
    v_sms_ok := private.has_feature(new.tenant_id, 'advanced_notifications') and v_today < v_cap;

    if new.audience = 'customer' and new.recipient_user_id is not null then
      select email::text, phone into v_email, v_cphone from public.kitchen_customers where tenant_id = new.tenant_id and user_id = new.recipient_user_id;
      v_link := case when new.data ? 'order_id' and v_host is not null then v_proto || '://' || v_host || '/orders/' || (new.data ->> 'order_id') else null end;
      if v_c_email and v_email is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, subject, body)
        values (new.tenant_id, new.id, 'email', v_email, new.title || ' - ' || t.name,
                new.title || E'\n\n' || coalesce('Track your order: ' || v_link, '') || E'\n\n' || t.name);
      end if;
      if v_c_sms and v_sms_ok and v_cphone is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, body)
        values (new.tenant_id, new.id, 'sms', v_cphone, left(t.name || ': ' || new.title || coalesce('. ' || v_link, ''), 300));
      end if;
    elsif new.audience = 'kitchen' then
      v_link := case when v_host is not null then v_proto || '://' || v_host || '/dashboard/orders' else null end;
      if v_k_email and t.contact_email is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, subject, body)
        values (new.tenant_id, new.id, 'email', t.contact_email, new.title, new.title || E'\n\n' || coalesce('Open the order board: ' || v_link, ''));
      end if;
      if v_k_sms and v_sms_ok and v_phone is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, body)
        values (new.tenant_id, new.id, 'sms', v_phone, left(new.title || coalesce('. ' || v_link, ''), 300));
      end if;
    end if;
  exception when others then
    raise warning 'enqueue_deliveries failed: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.enqueue_deliveries() from public, anon, authenticated;
create trigger notifications_enqueue after insert on public.notifications for each row execute function private.enqueue_deliveries();

create or replace function public.claim_deliveries(p_limit int default 20)
returns setof public.notification_deliveries language sql security definer set search_path = '' as $$
  update public.notification_deliveries d set status = 'sending', attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes'
  where d.id in (
    select id from public.notification_deliveries
    where status in ('queued','sending') and next_attempt_at <= now() and attempts < 5
    order by created_at limit p_limit for update skip locked)
  returning d.*;
$$;
create or replace function public.complete_delivery(p_id uuid, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.notification_deliveries set
    status = case when p_ok then 'sent' when attempts >= 5 then 'failed' else 'queued' end,
    sent_at = case when p_ok then now() else sent_at end,
    last_error = case when p_ok then null else left(p_error, 300) end,
    next_attempt_at = case when p_ok then next_attempt_at else now() + (attempts * interval '2 minutes') end
  where id = p_id;
$$;
revoke all on function public.claim_deliveries(int), public.complete_delivery(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_deliveries(int), public.complete_delivery(uuid, boolean, text) to service_role;

-- =====================================================================
-- 4. Payout accounts (admin-approved destination for B2C)
-- =====================================================================
create type public.payout_account_status as enum ('pending_review','approved','rejected','replaced');
create table public.payout_accounts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  msisdn       text not null check (msisdn ~ '^254[17][0-9]{8}$'),
  account_name text not null check (length(account_name) between 2 and 80),
  status       public.payout_account_status not null default 'pending_review',
  requested_by uuid references auth.users(id),
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index payout_accounts_one_approved on public.payout_accounts (tenant_id) where status = 'approved';
create unique index payout_accounts_one_pending on public.payout_accounts (tenant_id) where status = 'pending_review';

create or replace function private.norm_msisdn(p text) returns text language sql immutable as $$
  select case
    when regexp_replace(coalesce(p,''), '[\s\-+()]', '', 'g') ~ '^0[17][0-9]{8}$' then '254' || substr(regexp_replace(p, '[\s\-+()]', '', 'g'), 2)
    when regexp_replace(coalesce(p,''), '[\s\-+()]', '', 'g') ~ '^[17][0-9]{8}$' then '254' || regexp_replace(p, '[\s\-+()]', '', 'g')
    when regexp_replace(coalesce(p,''), '[\s\-+()]', '', 'g') ~ '^254[17][0-9]{8}$' then regexp_replace(p, '[\s\-+()]', '', 'g')
    else null end;
$$;

create or replace function public.request_payout_account(p_tenant uuid, p_msisdn text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_m text := private.norm_msisdn(p_msisdn); v_id uuid;
begin
  if not private.has_permission(p_tenant, 'settings.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if v_m is null then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  perform private.rate_check('payoutacct:' || p_tenant, 5, 86400);
  update public.payout_accounts set status = 'rejected', reviewed_at = now() where tenant_id = p_tenant and status = 'pending_review';
  insert into public.payout_accounts (tenant_id, msisdn, account_name, requested_by) values (p_tenant, v_m, trim(p_name), auth.uid()) returning id into v_id;
  perform private.write_audit(p_tenant, 'payout_account.requested', 'payout_account', v_id, jsonb_build_object('msisdn_last4', right(v_m, 4)));
  return v_id;
end $$;
create or replace function public.review_payout_account(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.payout_accounts%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v from public.payout_accounts where id = p_id for update;
  if not found or v.status <> 'pending_review' then raise exception 'nothing_to_review' using errcode = 'P0001'; end if;
  if p_approve then
    update public.payout_accounts set status = 'replaced' where tenant_id = v.tenant_id and status = 'approved';
  end if;
  update public.payout_accounts set status = case when p_approve then 'approved'::public.payout_account_status else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform private.write_audit(v.tenant_id, case when p_approve then 'payout_account.approved' else 'payout_account.rejected' end, 'payout_account', p_id, '{}'::jsonb);
end $$;
revoke all on function public.request_payout_account(uuid, text, text), public.review_payout_account(uuid, boolean) from public, anon;
grant execute on function public.request_payout_account(uuid, text, text), public.review_payout_account(uuid, boolean) to authenticated;

-- =====================================================================
-- 5. B2C payouts
-- =====================================================================
alter table public.payouts
  add column originator_conversation_id text unique,
  add column conversation_id text,
  add column mpesa_receipt text,
  add column destination_msisdn text,
  add column failure_reason text,
  add column sent_at timestamptz;

create or replace function public.create_payout(p_tenant uuid, p_amount_minor bigint, p_method text default 'manual', p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_out bigint; v_open bigint; v_cur char(3); v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_method not in ('manual','mpesa_b2c','bank') then raise exception 'invalid_method' using errcode = 'P0001'; end if;
  if p_amount_minor % 100 <> 0 then raise exception 'amount_not_whole_shillings' using errcode = 'P0001'; end if;
  if p_method = 'mpesa_b2c' and not exists (select 1 from public.payout_accounts where tenant_id = p_tenant and status = 'approved') then
    raise exception 'no_payout_account' using errcode = 'P0001'; end if;
  perform 1 from public.tenants where id = p_tenant for update;
  select currency into v_cur from public.tenants where id = p_tenant;
  select coalesce(sum(amount_minor),0) into v_out from public.ledger_entries where tenant_id = p_tenant;
  select coalesce(sum(amount_minor),0) into v_open from public.payouts where tenant_id = p_tenant and status in ('pending','processing');
  if p_amount_minor > v_out - v_open then raise exception 'insufficient_balance' using errcode = 'P0001'; end if;
  insert into public.payouts (tenant_id, amount_minor, currency, method, note, created_by)
  values (p_tenant, p_amount_minor, v_cur, p_method, p_note, auth.uid()) returning id into v_id;
  perform private.write_audit(p_tenant, 'payout.created', 'payout', v_id, jsonb_build_object('amount_minor', p_amount_minor, 'method', p_method));
  return v_id;
end $$;

-- Shared ledger posting for a finished payout (manual or B2C). Idempotent via the unique ledger index.
create or replace function private.post_payout(p_payout uuid, p_reference text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  select * into v_p from public.payouts where id = p_payout for update;
  update public.payouts set status = 'completed', reference = coalesce(p_reference, reference), completed_by = p_actor, completed_at = now() where id = p_payout;
  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, payout_id, description, created_by)
  values (v_p.tenant_id, 'payout', -v_p.amount_minor, v_p.currency, v_p.id, 'Payout to kitchen', p_actor)
  on conflict do nothing;
  perform private.write_audit(v_p.tenant_id, 'payout.completed', 'payout', p_payout, jsonb_build_object('reference', p_reference));
end $$;
revoke all on function private.post_payout(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.complete_payout(p_payout uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_p from public.payouts where id = p_payout for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.status not in ('pending','processing') then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  perform private.post_payout(p_payout, p_reference, auth.uid());
end $$;

create or replace function public.fail_payout_manual(p_payout uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_p from public.payouts where id = p_payout for update;
  if not found or v_p.status <> 'processing' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  update public.payouts set status = 'failed', failure_reason = left(p_reason, 300) where id = p_payout;
  perform private.write_audit(v_p.tenant_id, 'payout.failed_manual', 'payout', p_payout, jsonb_build_object('reason', p_reason));
end $$;
revoke all on function public.fail_payout_manual(uuid, text) from public, anon;
grant execute on function public.fail_payout_manual(uuid, text) to authenticated;

-- Called by the mpesa-b2c-payout Edge Function (service role). p_admin = the verified caller.
create or replace function public.begin_b2c_payout(p_payout uuid, p_admin uuid)
returns table (originator_id text, msisdn text, amount_minor bigint, tenant_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype; v_acct public.payout_accounts%rowtype; v_orig text;
begin
  if not exists (select 1 from public.platform_staff where user_id = p_admin and role in ('owner','admin')) then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_p from public.payouts where id = p_payout for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.method <> 'mpesa_b2c' or v_p.status <> 'pending' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  select * into v_acct from public.payout_accounts a where a.tenant_id = v_p.tenant_id and a.status = 'approved';
  if not found then raise exception 'no_payout_account' using errcode = 'P0001'; end if;
  v_orig := gen_random_uuid()::text;
  update public.payouts set status = 'processing', originator_conversation_id = v_orig, destination_msisdn = v_acct.msisdn, sent_at = now() where id = p_payout;
  perform private.write_audit(v_p.tenant_id, 'payout.b2c_sent', 'payout', p_payout, jsonb_build_object('msisdn_last4', right(v_acct.msisdn, 4)));
  return query select v_orig, v_acct.msisdn, v_p.amount_minor, v_p.tenant_id;
end $$;

-- Daraja definitively rejected the request: nothing was sent, so the payout is failed (admin can create another).
create or replace function public.fail_b2c_initiation(p_payout uuid, p_desc text)
returns void language sql security definer set search_path = '' as $$
  update public.payouts set status = 'failed', failure_reason = left(p_desc, 300) where id = p_payout and status = 'processing';
$$;
create or replace function public.attach_b2c_response(p_payout uuid, p_conversation_id text)
returns void language sql security definer set search_path = '' as $$
  update public.payouts set conversation_id = p_conversation_id where id = p_payout;
$$;

create or replace function public.complete_b2c_payout(p_originator text, p_receipt text, p_amount_minor bigint, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  insert into public.payment_events (provider, external_id, event_type, payload) values ('mpesa_b2c', p_originator, 'result_success', p_raw)
  on conflict do nothing;
  select * into v_p from public.payouts where originator_conversation_id = p_originator for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.status = 'completed' then return; end if;
  if v_p.status not in ('processing','failed') then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  update public.payouts set mpesa_receipt = p_receipt,
    failure_reason = case when p_amount_minor is not null and p_amount_minor <> v_p.amount_minor then 'amount_differs: paid ' || p_amount_minor else null end
  where id = v_p.id;
  perform private.post_payout(v_p.id, p_receipt, null);
end $$;

create or replace function public.fail_b2c_payout(p_originator text, p_code int, p_desc text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  insert into public.payment_events (provider, external_id, event_type, payload) values ('mpesa_b2c', p_originator, 'result_failure', p_raw)
  on conflict do nothing;
  select * into v_p from public.payouts where originator_conversation_id = p_originator for update;
  if not found or v_p.status <> 'processing' then return; end if;
  update public.payouts set status = 'failed', failure_reason = left(coalesce(p_code::text, '') || ' ' || coalesce(p_desc, ''), 300) where id = v_p.id;
  perform private.write_audit(v_p.tenant_id, 'payout.failed', 'payout', v_p.id, jsonb_build_object('code', p_code));
end $$;

revoke all on function public.begin_b2c_payout(uuid, uuid), public.fail_b2c_initiation(uuid, text), public.attach_b2c_response(uuid, text),
  public.complete_b2c_payout(text, text, bigint, jsonb), public.fail_b2c_payout(text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_b2c_payout(uuid, uuid), public.fail_b2c_initiation(uuid, text), public.attach_b2c_response(uuid, text),
  public.complete_b2c_payout(text, text, bigint, jsonb), public.fail_b2c_payout(text, int, text, jsonb) to service_role;
-- (create_payout/complete_payout/cancel_payout keep their authenticated grants from 009; re-assert after CREATE OR REPLACE)
revoke all on function public.create_payout(uuid, bigint, text, text), public.complete_payout(uuid, text) from public, anon;
grant execute on function public.create_payout(uuid, bigint, text, text), public.complete_payout(uuid, text) to authenticated;

-- =====================================================================
-- 6. Refunds (M-Pesa reversal or manual)
-- =====================================================================
create type public.refund_status as enum ('processing','completed','failed');
create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  payment_id    uuid not null references public.payments(id),
  order_id      uuid,
  amount_minor  bigint not null check (amount_minor > 0),
  status        public.refund_status not null default 'processing',
  method        text not null check (method in ('mpesa_reversal','manual')),
  originator_conversation_id text unique,
  conversation_id text,
  reference     text,
  failure_reason text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id)
);
create unique index refunds_one_active_per_payment on public.refunds (payment_id) where status in ('processing','completed');

create or replace function private.finalize_order_refund(p_order uuid, p_reference text, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.orders%rowtype;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_o.status not in ('CANCELLED','REJECTED') or v_o.paid_at is null then raise exception 'order_not_refundable' using errcode = 'P0001'; end if;
  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, description, created_by)
  values (v_o.tenant_id, 'refund', -v_o.total_minor, v_o.currency, v_o.id, 'Refund to customer: ' || coalesce(p_reference,''), p_actor);
  if coalesce(v_o.commission_minor, 0) > 0 then
    insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, description, created_by)
    values (v_o.tenant_id, 'commission_reversal', v_o.commission_minor, v_o.currency, v_o.id, 'Commission reversed on refund', p_actor);
  end if;
  perform private.apply_transition(p_order, 'REFUNDED', p_actor, case when p_actor is null then 'system' else 'staff' end, p_reference);
  perform private.write_audit(v_o.tenant_id, 'order.refunded', 'order', p_order, jsonb_build_object('reference', p_reference));
end $$;
revoke all on function private.finalize_order_refund(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.refund_order(p_order uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_o public.orders%rowtype; v_pay public.payments%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select * into v_pay from public.payments where order_id = p_order and status = 'SUCCEEDED';
  if not found then raise exception 'order_not_refundable' using errcode = 'P0001'; end if;
  if exists (select 1 from public.refunds where payment_id = v_pay.id and status in ('processing','completed')) then
    raise exception 'refund_in_progress' using errcode = 'P0001'; end if;
  insert into public.refunds (tenant_id, payment_id, order_id, amount_minor, status, method, reference, created_by, completed_at)
  values (v_o.tenant_id, v_pay.id, p_order, v_o.total_minor, 'completed', 'manual', p_reference, auth.uid(), now());
  perform private.finalize_order_refund(p_order, p_reference, auth.uid());
end $$;

create or replace function public.resolve_payment_refund(p_payment uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_pay from public.payments where id = p_payment and needs_refund for update;
  if not found then raise exception 'nothing_to_refund' using errcode = 'P0001'; end if;
  if exists (select 1 from public.refunds where payment_id = p_payment and status in ('processing','completed')) then
    raise exception 'refund_in_progress' using errcode = 'P0001'; end if;
  insert into public.refunds (tenant_id, payment_id, amount_minor, status, method, reference, created_by, completed_at)
  values (v_pay.tenant_id, p_payment, v_pay.amount_minor, 'completed', 'manual', p_reference, auth.uid(), now());
  update public.payments set needs_refund = false, refund_reference = p_reference, refunded_at = now() where id = p_payment;
  perform private.write_audit(v_pay.tenant_id, 'payment.refunded', 'payment', p_payment, jsonb_build_object('reference', p_reference));
end $$;
revoke all on function public.refund_order(uuid, text), public.resolve_payment_refund(uuid, text) from public, anon;
grant execute on function public.refund_order(uuid, text), public.resolve_payment_refund(uuid, text) to authenticated;

-- Service-only helpers for the mpesa-refund Edge Function. Exactly one of p_order / p_payment is used.
create or replace function public.begin_refund(p_order uuid, p_payment uuid, p_admin uuid)
returns table (refund_id uuid, receipt text, amount_minor bigint, tenant_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments%rowtype; v_o public.orders%rowtype; v_id uuid;
begin
  if not exists (select 1 from public.platform_staff where user_id = p_admin and role in ('owner','admin')) then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_order is not null then
    select * into v_o from public.orders where id = p_order for update;
    if not found or v_o.status not in ('CANCELLED','REJECTED') or v_o.paid_at is null then raise exception 'order_not_refundable' using errcode = 'P0001'; end if;
    select * into v_pay from public.payments where order_id = p_order and status = 'SUCCEEDED' for update;
  else
    select * into v_pay from public.payments where id = p_payment and needs_refund for update;
  end if;
  if not found then raise exception 'nothing_to_refund' using errcode = 'P0001'; end if;
  if v_pay.provider_receipt is null then raise exception 'receipt_missing' using errcode = 'P0001'; end if;
  if exists (select 1 from public.refunds r where r.payment_id = v_pay.id and r.status in ('processing','completed')) then
    raise exception 'refund_in_progress' using errcode = 'P0001'; end if;
  insert into public.refunds (tenant_id, payment_id, order_id, amount_minor, method, created_by)
  values (v_pay.tenant_id, v_pay.id, p_order, v_pay.amount_minor, 'mpesa_reversal', p_admin) returning id into v_id;
  perform private.write_audit(v_pay.tenant_id, 'refund.reversal_requested', 'payment', v_pay.id, '{}'::jsonb);
  return query select v_id, v_pay.provider_receipt, v_pay.amount_minor, v_pay.tenant_id;
end $$;
create or replace function public.attach_reversal_response(p_refund uuid, p_originator text, p_conversation text)
returns void language sql security definer set search_path = '' as $$
  update public.refunds set originator_conversation_id = p_originator, conversation_id = p_conversation where id = p_refund and status = 'processing';
$$;
create or replace function public.fail_refund_initiation(p_refund uuid, p_desc text)
returns void language sql security definer set search_path = '' as $$
  update public.refunds set status = 'failed', failure_reason = left(p_desc, 300) where id = p_refund and status = 'processing';
$$;
create or replace function public.complete_refund(p_originator text, p_reference text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_r public.refunds%rowtype;
begin
  insert into public.payment_events (provider, external_id, event_type, payload) values ('mpesa_reversal', p_originator, 'result_success', p_raw) on conflict do nothing;
  select * into v_r from public.refunds where originator_conversation_id = p_originator for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0002'; end if;
  if v_r.status = 'completed' then return; end if;
  update public.refunds set status = 'completed', reference = p_reference, completed_at = now() where id = v_r.id;
  if v_r.order_id is not null then
    perform private.finalize_order_refund(v_r.order_id, p_reference, null);
  else
    update public.payments set needs_refund = false, refund_reference = p_reference, refunded_at = now() where id = v_r.payment_id;
  end if;
end $$;
create or replace function public.fail_refund(p_originator text, p_code int, p_desc text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payment_events (provider, external_id, event_type, payload) values ('mpesa_reversal', p_originator, 'result_failure', p_raw) on conflict do nothing;
  update public.refunds set status = 'failed', failure_reason = left(coalesce(p_code::text,'') || ' ' || coalesce(p_desc,''), 300)
   where originator_conversation_id = p_originator and status = 'processing';
end $$;
revoke all on function public.begin_refund(uuid, uuid, uuid), public.attach_reversal_response(uuid, text, text), public.fail_refund_initiation(uuid, text),
  public.complete_refund(text, text, jsonb), public.fail_refund(text, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.begin_refund(uuid, uuid, uuid), public.attach_reversal_response(uuid, text, text), public.fail_refund_initiation(uuid, text),
  public.complete_refund(text, text, jsonb), public.fail_refund(text, int, text, jsonb) to service_role;

-- =====================================================================
-- 7. RLS + grants for the new tables (default privileges would otherwise expose them)
-- =====================================================================
alter table public.tenant_notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.payout_accounts enable row level security;
alter table public.refunds enable row level security;
revoke all on public.tenant_notification_settings, public.notification_deliveries, public.payout_accounts, public.refunds from anon, authenticated;
revoke all on public.customer_stats from anon;

grant select, insert, update on public.tenant_notification_settings to authenticated;
create policy tns_read on public.tenant_notification_settings for select to authenticated using (private.has_permission(tenant_id, 'settings.manage') or private.is_platform_staff());
create policy tns_write on public.tenant_notification_settings for all to authenticated
  using (private.has_permission(tenant_id, 'settings.manage')) with check (private.has_permission(tenant_id, 'settings.manage'));
grant select on public.notification_deliveries to authenticated;
create policy deliveries_admin on public.notification_deliveries for select to authenticated using (private.is_platform_staff());
grant select on public.payout_accounts to authenticated;
create policy payout_accounts_read on public.payout_accounts for select to authenticated
  using (private.has_permission(tenant_id, 'settings.manage') or private.is_platform_staff());
grant select on public.refunds to authenticated;
create policy refunds_read on public.refunds for select to authenticated using (private.has_permission(tenant_id, 'finance.view') or private.is_platform_staff());
