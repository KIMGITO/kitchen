-- 023_flutterwave_schema.sql
-- Flutterwave split payments + async ledger settlement.
-- "kitchens" = public.tenants. Depends only on: public.tenants(id), public.orders(id),
-- public.platform_settings(key,value) key/value store. All money in integer minor units.

-- 1) Kitchen payout fields on tenants.
alter table public.tenants
  add column if not exists flutterwave_subaccount_id text,
  add column if not exists payout_method text not null default 'mobile_money',
  add column if not exists payout_destination text,
  add column if not exists is_verified boolean not null default false;
do $$ begin
  alter table public.tenants add constraint tenants_payout_method_chk
    check (payout_method in ('mobile_money', 'bank', 'till'));
exception when duplicate_object then null; end $$;
create index if not exists tenants_fw_subaccount_idx on public.tenants(flutterwave_subaccount_id);

-- 2) Platform config keys (single source of truth for commission + currency).
-- Shape-agnostic seed: works whether value is jsonb or text.
insert into public.platform_settings(key, value)
select 'global_commission_percentage', to_jsonb(10.00)
where not exists (select 1 from public.platform_settings where key = 'global_commission_percentage');
insert into public.platform_settings(key, value)
select 'system_currency', to_jsonb('KES'::text)
where not exists (select 1 from public.platform_settings where key = 'system_currency');

-- 3) Async payout queue: exactly one row per paid order (webhook retries are no-ops).
create table if not exists public.kitchen_ledgers (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade unique,
  gross_minor bigint not null check (gross_minor >= 0),
  commission_minor bigint not null default 0 check (commission_minor >= 0),
  amount_accrued bigint not null check (amount_accrued >= 0),
  status text not null default 'pending' check (status in ('pending', 'settled', 'failed')),
  attempts int not null default 0,
  last_error text,
  flutterwave_transfer_id text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kitchen_ledgers_pending_idx
  on public.kitchen_ledgers(kitchen_id, created_at) where status = 'pending';

-- 4) Checkout intents: bridge fw-checkout-init -> fw-webhook via tx_ref.
create table if not exists public.fw_payment_intents (
  tx_ref text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  commission_bps int not null default 1000 check (commission_bps >= 0 and commission_bps <= 10000),
  commission_minor bigint not null default 0,
  kitchen_net_minor bigint not null default 0,
  currency text not null default 'KES',
  status text not null default 'initiated'
    check (status in ('initiated', 'successful', 'failed', 'cancelled')),
  flutterwave_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists fw_intents_order_idx on public.fw_payment_intents(order_id);

-- 5) SaaS billing records: recurring kitchen subscriptions via Flutterwave.
create table if not exists public.fw_subscription_billing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_key text not null,
  fw_plan_id int,
  fw_subscription_id int,
  amount_minor bigint not null check (amount_minor >= 0),
  interval text not null default 'monthly' check (interval in ('monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  created_at timestamptz not null default now()
);

-- 6) RLS: reads are platform-staff-only; writes are service_role-only (Edge Functions
-- bypass RLS). No insert/update/delete policies => authenticated users cannot write.
alter table public.kitchen_ledgers enable row level security;
alter table public.fw_payment_intents enable row level security;
alter table public.fw_subscription_billing enable row level security;
drop policy if exists kitchen_ledgers_read on public.kitchen_ledgers;
create policy kitchen_ledgers_read on public.kitchen_ledgers for select to authenticated
  using (exists (select 1 from public.platform_staff ps where ps.user_id = auth.uid()));
drop policy if exists fw_intents_read on public.fw_payment_intents;
create policy fw_intents_read on public.fw_payment_intents for select to authenticated
  using (exists (select 1 from public.platform_staff ps where ps.user_id = auth.uid()));
drop policy if exists fw_billing_read on public.fw_subscription_billing;
create policy fw_billing_read on public.fw_subscription_billing for select to authenticated
  using (exists (select 1 from public.platform_staff ps where ps.user_id = auth.uid()));
