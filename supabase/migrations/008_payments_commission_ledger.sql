-- 008: commission rules, payments, payment events, append-only ledger

-- ---------- Commission rules (versioned, append-only by convention) ----------
create type public.commission_scope as enum ('platform','plan','tenant');

create table public.commission_rules (
  id              uuid primary key default gen_random_uuid(),
  scope           public.commission_scope not null,
  tenant_id       uuid references public.tenants(id) on delete cascade,
  plan_key        text references public.plans(key),
  enabled         boolean not null,
  percent_bps     int not null default 0 check (percent_bps between 0 and 10000),  -- 1000 = 10%
  fixed_minor     bigint not null default 0 check (fixed_minor >= 0),
  effective_from  timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  check ((scope = 'platform' and tenant_id is null and plan_key is null)
      or (scope = 'plan'     and tenant_id is null and plan_key is not null)
      or (scope = 'tenant'   and tenant_id is not null and plan_key is null))
);
create index commission_rules_lookup on public.commission_rules (scope, tenant_id, plan_key, effective_from desc);

-- Initial platform default (configuration). Change it from the admin panel; this inserts a NEW version.
insert into public.commission_rules (scope, enabled, percent_bps, fixed_minor) values ('platform', true, 1000, 0);

-- Resolution order: tenant override -> plan rule -> platform default (latest effective version of each).
create or replace function private.resolve_commission_rule(p_tenant uuid, p_at timestamptz default now())
returns public.commission_rules language sql stable security definer set search_path = '' as $$
  select r.* from public.commission_rules r
  where r.effective_from <= p_at and (
        (r.scope = 'tenant'   and r.tenant_id = p_tenant)
     or (r.scope = 'plan'     and r.plan_key = private.tenant_plan(p_tenant))
     or (r.scope = 'platform'))
  order by case r.scope when 'tenant' then 1 when 'plan' then 2 else 3 end,
           r.effective_from desc, r.created_at desc
  limit 1;
$$;

-- Admin changes create a new version and are audited.
create or replace function public.set_commission_rule(
  p_scope public.commission_scope, p_tenant uuid, p_plan text,
  p_enabled boolean, p_percent_bps int, p_fixed_minor bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  insert into public.commission_rules (scope, tenant_id, plan_key, enabled, percent_bps, fixed_minor, created_by)
  values (p_scope, p_tenant, p_plan, p_enabled, p_percent_bps, p_fixed_minor, auth.uid())
  returning id into v_id;
  perform private.write_audit(p_tenant, 'commission.changed', 'commission_rule', v_id,
    jsonb_build_object('scope', p_scope, 'plan', p_plan, 'enabled', p_enabled,
                       'percent_bps', p_percent_bps, 'fixed_minor', p_fixed_minor));
  return v_id;
end $$;
revoke all on function public.set_commission_rule(public.commission_scope, uuid, text, boolean, int, bigint) from public;
grant execute on function public.set_commission_rule(public.commission_scope, uuid, text, boolean, int, bigint) to authenticated;

-- ---------- Payments ----------
create type public.payment_status as enum ('INITIATED','STK_SENT','SUCCEEDED','FAILED','CANCELLED_BY_USER','TIMEOUT');

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  order_id              uuid not null,
  kitchen_customer_id   uuid not null,
  provider              text not null default 'mpesa',
  status                public.payment_status not null default 'INITIATED',
  amount_minor          bigint not null check (amount_minor > 0),
  currency              char(3) not null,
  msisdn                text not null,
  idempotency_key       text not null unique,
  merchant_request_id   text,
  checkout_request_id   text unique,
  provider_receipt      text unique,
  result_code           int,
  result_desc           text,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id),
  foreign key (tenant_id, kitchen_customer_id) references public.kitchen_customers (tenant_id, id)
);
-- At most one in-flight or successful payment per order.
create unique index payments_one_active_per_order on public.payments (order_id)
  where status in ('INITIATED','STK_SENT','SUCCEEDED');
create index payments_tenant_created on public.payments (tenant_id, created_at desc);
create trigger payments_updated_at before update on public.payments
  for each row execute function private.set_updated_at();

-- Raw provider callbacks. The unique key blocks replays.
create table public.payment_events (
  id            bigint generated always as identity primary key,
  tenant_id     uuid,
  payment_id    uuid references public.payments(id),
  provider      text not null,
  external_id   text not null,
  event_type    text not null,
  payload       jsonb not null,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (provider, external_id, event_type)
);

-- ---------- Ledger (append-only, signed effect on what the platform owes the kitchen) ----------
create type public.ledger_entry_type as enum
  ('sale','commission','refund','commission_reversal','adjustment','payout');

create table public.ledger_entries (
  id            bigint generated always as identity primary key,
  tenant_id     uuid not null references public.tenants(id),
  entry_type    public.ledger_entry_type not null,
  amount_minor  bigint not null check (amount_minor <> 0),   -- + increases kitchen payable, - decreases
  currency      char(3) not null,
  order_id      uuid,
  payment_id    uuid references public.payments(id),
  payout_id     uuid,
  commission_rule_id uuid references public.commission_rules(id),
  description   text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  check ((entry_type in ('sale','commission','refund','commission_reversal') and order_id is not null)
      or entry_type in ('adjustment','payout'))
);
create index ledger_tenant_created on public.ledger_entries (tenant_id, created_at desc);
create index ledger_order on public.ledger_entries (order_id);
-- Idempotency: one sale and one commission entry per order.
create unique index ledger_one_sale_per_order on public.ledger_entries (order_id) where entry_type = 'sale';
create unique index ledger_one_commission_per_order on public.ledger_entries (order_id) where entry_type = 'commission';

create or replace function private.block_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only; post a reversing entry instead' using errcode = '42501';
end $$;
create trigger ledger_no_update before update or delete on public.ledger_entries
  for each row execute function private.block_ledger_mutation();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.block_ledger_mutation();

-- Derived balances (never a mutable balance column).
create view public.kitchen_balances with (security_invoker = true) as
select tenant_id,
  coalesce(sum(amount_minor) filter (where entry_type = 'sale'), 0)                       as gross_sales_minor,
  coalesce(-sum(amount_minor) filter (where entry_type in ('commission','commission_reversal')), 0) as commission_minor,
  coalesce(-sum(amount_minor) filter (where entry_type = 'refund'), 0)                    as refunds_minor,
  coalesce(sum(amount_minor) filter (where entry_type = 'adjustment'), 0)                 as adjustments_minor,
  coalesce(-sum(amount_minor) filter (where entry_type = 'payout'), 0)                    as paid_out_minor,
  coalesce(sum(amount_minor), 0)                                                          as outstanding_minor
from public.ledger_entries group by tenant_id;

-- ---------- Atomic payment confirmation (service role only; called by the verified M-Pesa callback) ----------
create or replace function public.record_payment_success(
  p_checkout_request_id text, p_receipt text, p_amount_minor bigint, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments%rowtype;
  v_order public.orders%rowtype;
  v_rule public.commission_rules%rowtype;
  v_commission bigint := 0;
  v_event_id bigint;
begin
  insert into public.payment_events (provider, external_id, event_type, payload)
  values ('mpesa', p_checkout_request_id, 'callback_success', p_raw)
  on conflict (provider, external_id, event_type) do nothing
  returning id into v_event_id;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if v_pay.status = 'SUCCEEDED' then return v_pay.id; end if;   -- idempotent replay

  if p_amount_minor <> v_pay.amount_minor then
    update public.payments set status = 'FAILED', result_desc = 'amount_mismatch' where id = v_pay.id;
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  update public.payments set status = 'SUCCEEDED', provider_receipt = p_receipt,
         result_code = 0, completed_at = now() where id = v_pay.id;

  select * into v_order from public.orders where id = v_pay.order_id for update;

  select * into v_rule from private.resolve_commission_rule(v_order.tenant_id, now());
  if v_rule.enabled then
    v_commission := least(v_order.total_minor,
        round(v_order.total_minor * v_rule.percent_bps / 10000.0)::bigint + v_rule.fixed_minor);
  end if;

  update public.orders set
    commission_rule_id = v_rule.id, commission_enabled = v_rule.enabled,
    commission_percent_bps = v_rule.percent_bps, commission_fixed_minor = v_rule.fixed_minor,
    commission_minor = v_commission, kitchen_net_minor = v_order.total_minor - v_commission,
    paid_at = now()
  where id = v_order.id;

  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, payment_id, commission_rule_id, description)
  values (v_order.tenant_id, 'sale', v_order.total_minor, v_order.currency, v_order.id, v_pay.id, v_rule.id, 'Order payment received');
  if v_commission > 0 then
    insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, order_id, payment_id, commission_rule_id, description)
    values (v_order.tenant_id, 'commission', -v_commission, v_order.currency, v_order.id, v_pay.id, v_rule.id, 'Platform commission');
  end if;

  perform private.apply_transition(v_order.id, 'PAID', null, 'system', 'Payment confirmed');
  perform private.apply_transition(v_order.id, 'RECEIVED', null, 'system', null);

  update public.payment_events set payment_id = v_pay.id, tenant_id = v_order.tenant_id, processed_at = now()
   where id = v_event_id;
  return v_pay.id;
end $$;
revoke all on function public.record_payment_success(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_success(text, text, bigint, jsonb) to service_role;

create or replace function public.record_payment_failure(
  p_checkout_request_id text, p_status public.payment_status, p_result_code int, p_result_desc text, p_raw jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pay public.payments%rowtype;
begin
  if p_status not in ('FAILED','CANCELLED_BY_USER','TIMEOUT') then
    raise exception 'invalid_failure_status' using errcode = 'P0001'; end if;
  insert into public.payment_events (provider, external_id, event_type, payload)
  values ('mpesa', p_checkout_request_id, 'callback_failure', p_raw)
  on conflict (provider, external_id, event_type) do nothing;

  select * into v_pay from public.payments where checkout_request_id = p_checkout_request_id for update;
  if not found or v_pay.status in ('SUCCEEDED','FAILED','CANCELLED_BY_USER','TIMEOUT') then return; end if;

  update public.payments set status = p_status, result_code = p_result_code,
         result_desc = p_result_desc, completed_at = now() where id = v_pay.id;
  perform private.apply_transition(v_pay.order_id, 'PAYMENT_FAILED', null, 'system', p_result_desc);
end $$;
revoke all on function public.record_payment_failure(text, public.payment_status, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_payment_failure(text, public.payment_status, int, text, jsonb) to service_role;
