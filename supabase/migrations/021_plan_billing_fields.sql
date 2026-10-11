-- 021: plan pricing fields for the self-service billing page.
-- The original `plans` table carried a single `price_minor` (monthly) plus a
-- `billing_interval`. The billing page needs explicit monthly & yearly prices, a
-- marketing description, a staff limit and a public flag. We add them and backfill
-- from the existing `price_minor` so no data is lost and the admin panel keeps
-- working (it still edits `price_minor`, which we keep in sync as the monthly price).

alter table public.plans
  add column if not exists price_monthly_minor bigint not null default 0 check (price_monthly_minor >= 0),
  add column if not exists price_yearly_minor  bigint not null default 0 check (price_yearly_minor >= 0),
  add column if not exists description         text,
  add column if not exists staff_limit         int check (staff_limit is null or staff_limit >= 1),
  add column if not exists is_public           boolean not null default true;

-- Backfill: existing price_minor becomes the monthly price; yearly defaults to
-- 11x monthly (one month free) unless already set. If a plan was yearly-billed,
-- treat its price as the yearly figure and derive monthly.
update public.plans
   set price_monthly_minor = case when billing_interval = 'year'
                                   then round(price_minor / 12.0) else price_minor end,
       price_yearly_minor  = case when billing_interval = 'year'
                                   then price_minor else price_minor * 11 end
 where price_monthly_minor = 0 or price_yearly_minor = 0;

-- Keep the legacy single-price column in sync with monthly for the admin panel:
-- whenever price_minor changes, mirror it into price_monthly_minor.
create or replace function public.sync_plan_monthly_price()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.price_minor <> old.price_minor and new.price_monthly_minor = old.price_monthly_minor then
    new.price_monthly_minor := new.price_minor;
  end if;
  return new;
end $$;

drop trigger if exists plans_sync_monthly_price on public.plans;
create trigger plans_sync_monthly_price before update on public.plans
  for each row execute function public.sync_plan_monthly_price();

-- Default staff limits from the existing plan_features limits (best effort).
update public.plans p set staff_limit = pf.limit_value::int
  from public.plan_features pf
 where pf.plan_key = p.key and pf.feature_key = 'max_staff'
   and p.staff_limit is null and pf.limit_value is not null;
