-- 022: Flutterwave split-payments + async minimum-payout ledger.
-- Deprecates direct Daraja STK for NEW checkouts (Daraja functions remain for in-flight orders).
-- Money model is unchanged: integer minor units, append-only ledger_entries, service-role webhooks.
--
-- Reconciliation with existing schema (documented deviation):
--   * "kitchens" = public.tenants here. We add the requested payout fields there.
--   * "platform_settings" is a KEY/VALUE (jsonb) table, so the requested settings are added as keys
--     with a typed accessor (platform_config()) rather than typed columns.
--   * Commission keeps its SINGLE SOURCE OF TRUTH in the versioned, audited commission_rules table
--     (already supports tenant overrides). platform_config().global_commission_percent reads the latest
--     enabled platform rule; set_platform_commission() writes a new version (audited).

begin;

-- ---------- Kitchens (tenants): Flutterwave subaccount + payout destination ----------
alter table public.tenants
  add column if not exists flutterwave_subaccount_id text,
  add column if not exists payout_method text check (payout_method in ('mobile_money','bank','till')),
  add column if not exists payout_destination text,   -- MSISDN / account no / till number
  add column if not exists is_verified boolean not null default false;
comment on column public.tenants.payout_destination is 'mobile_money: +2547…, bank: acct number, till: till number.';

-- ---------- Platform settings: currency + commission (commission stays in commission_rules) ----------
insert into public.platform_settings (key, value) values
  ('system_currency', '"KES"'),
  ('mpesa_entry_fee_percent', '1.4')   -- Flutterwave M-Pesa processing fee, for reporting only
on conflict (key) do nothing;

-- ---------- Async payout ledger (minimum-payout queue) ----------
create type public.payout_ledger_status as enum ('pending','settled','failed');

create table public.kitchen_ledgers (
  id              uuid primary key default gen_random_uuid(),
  kitchen_id      uuid not null references public.tenants(id) on delete cascade,
  order_id        uuid not null,
  amount_accrued  bigint not null check (amount_accrued >= 0),   -- kitchen_net_minor (post-commission)
  currency        char(3) not null default 'KES',
  status          public.payout_ledger_status not null default 'pending',
  payout_reference text,          -- Flutterwave transfer id / reference once settled
  claimed_at      timestamptz,    -- set by the payout worker while a transfer is in flight
  settled_at      timestamptz,
  attempts        int not null default 0,   -- payout attempts (retry guard)
  last_error      text,          -- last Flutterwave failure reason (never leaks to tenant)
  created_at      timestamptz not null default now(),
  unique (order_id)               -- exactly one accrual per order (webhook idempotency at the DB level)
);
create index kitchen_ledgers_pending on public.kitchen_ledgers (kitchen_id, status) where status = 'pending';
create index kitchen_ledgers_claimable on public.kitchen_ledgers (claimed_at) where claimed_at is not null and status = 'pending';

-- Unclaimed, pending balance per kitchen (drives Rule A threshold + Rule B Friday flush).
create view public.kitchen_pending_balances with (security_invoker = true) as
select kitchen_id,
       currency,
       coalesce(sum(amount_accrued) filter (where status = 'pending' and claimed_at is null), 0) as pending_minor
from public.kitchen_ledgers
group by kitchen_id, currency;

commit;
