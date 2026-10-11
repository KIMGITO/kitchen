-- 020: subscription lifecycle — one kitchen one subscription, flexible terms,
-- automatic day counting, suspension with a reason, and read-only on lapse.
--
-- Duration conventions (mirrored in src/lib/subscription/duration.ts):
--   month = 30 days; year = 30*12 + 7 = 371 days; custom = explicit days (<= 367).

-- 1. New lifecycle statuses. `suspended` is added to the existing enum.
alter type public.subscription_status add value if not exists 'suspended' after 'past_due';

-- 2. Lifecycle columns.
alter table public.subscriptions
  add column if not exists duration_days      int check (duration_days is null or (duration_days between 1 and 367)),
  add column if not exists suspended_reason   text,
  add column if not exists suspended_at       timestamptz,
  add column if not exists last_renewed_at    timestamptz,
  add column if not exists auto_renew         boolean not null default true;

-- 3. Derived, cache-friendly health of the single *current* subscription per
--    kitchen (the live one if present, otherwise the most recent historical row).
--    Exactly one row per tenant, so it is safe to LEFT JOIN onto.
create or replace view public.subscription_health with (security_invoker = true) as
select s.tenant_id,
       s.id as subscription_id,
       s.plan_key,
       s.status,
       s.current_period_start,
       s.current_period_end,
       s.duration_days,
       s.suspended_reason,
       s.auto_renew,
       case
         when s.status = 'suspended' then 'suspended'
         when s.status = 'cancelled' then 'cancelled'
         when s.status = 'past_due'  then 'past_due'
         when s.current_period_end is not null and s.current_period_end <= now() then 'expired'
         when s.status = 'trialing' then 'trialing'
         when s.current_period_end is not null
              and s.current_period_end <= now() + interval '7 days' then 'expiring_soon'
         else 'active'
       end as computed_status,
       greatest(0, ceil(extract(epoch from (s.current_period_end - now())) / 86400))::int as days_remaining
from (
  select distinct on (tenant_id) *
  from public.subscriptions
  order by tenant_id,
           (status in ('trialing','active','past_due')) desc,  -- live rows first
           created_at desc
) s;

grant select on public.subscription_health to authenticated;

-- 4. Central helpers ---------------------------------------------------------

-- Canonical days for a term. month=30, year=367, custom=p_days (clamped 1..367).
create or replace function private.term_days(p_term text, p_days int)
returns int language plpgsql immutable set search_path = '' as $$
begin
  if p_term = 'year' then return 367; end if; -- 30*12 + 7 = 367
  if p_term = 'custom' then return greatest(1, least(coalesce(p_days, 30), 367)); end if;
  return 30; -- month (default)
end $$;

-- Only the current live subscription row for a tenant, or none.
create or replace function private.live_subscription(p_tenant uuid)
returns public.subscriptions language plpgsql stable security definer set search_path = '' as $$
declare v_s public.subscriptions;
begin
  select * into v_s from public.subscriptions
   where tenant_id = p_tenant and status in ('trialing','active','past_due')
   limit 1;
  return v_s;
end $$;

-- 5. Lifecycle RPCs (owner/admin of the kitchen only) -----------------------

-- Activate (or switch to) a plan for one term. Extends from remaining time when
-- still live, otherwise starts today. Keeps exactly one live row per kitchen.
create or replace function public.activate_subscription(
  p_tenant uuid, p_plan text, p_term text default 'month', p_days int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subscriptions;
  v_uid uuid := auth.uid();
  v_from timestamptz;
  v_len int;
begin
  if v_uid is null or not private.has_permission(p_tenant, 'settings.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where key = p_plan) then
    raise exception 'unknown_plan' using errcode = 'P0001'; end if;

  v_len := private.term_days(p_term, p_days);
  select * into v_s from private.live_subscription(p_tenant);
  if v_s.id is not null then
    v_from := greatest(coalesce(v_s.current_period_end, now()), now());
    update public.subscriptions
       set status = 'active', current_period_end = v_from + make_interval(days => v_len),
           duration_days = v_len, suspended_reason = null, suspended_at = null,
           last_renewed_at = now(), current_period_start = v_from
     where id = v_s.id;
    perform private.write_audit(p_tenant, 'subscription.renewed', 'subscription', v_s.id,
      jsonb_build_object('plan', p_plan, 'term', p_term, 'days', v_len, 'from', v_from));
    return v_s.id;
  else
    insert into public.subscriptions (tenant_id, plan_key, status, current_period_start, current_period_end, duration_days, last_renewed_at)
    values (p_tenant, p_plan, 'active', now(), now() + make_interval(days => v_len), v_len, now())
    returning id into v_s.id;
    perform private.write_audit(p_tenant, 'subscription.activated', 'subscription', v_s.id,
      jsonb_build_object('plan', p_plan, 'term', p_term, 'days', v_len));
    return v_s.id;
  end if;
end $$;

-- Renew for another term: extend the current live subscription (or reactivate a
-- lapsed one) without changing the plan. Picks up remaining time automatically.
create or replace function public.renew_subscription(
  p_tenant uuid, p_term text default 'month', p_days int default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  return public.activate_subscription(
    p_tenant,
    coalesce((select plan_key from private.live_subscription(p_tenant)),
             (select plan_key from public.subscriptions where tenant_id = p_tenant order by created_at desc limit 1),
             'basic'),
    p_term, p_days);
end $$;

-- Suspend: the owner/admin can still log in and view, but all write actions are
-- blocked until reactivated. `p_reason` is shown in the dashboard banner.
create or replace function public.suspend_subscription(p_tenant uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.subscriptions;
begin
  if auth.uid() is null or not private.has_permission(p_tenant, 'settings.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_s from private.live_subscription(p_tenant);
  if v_s.id is null then raise exception 'no_subscription' using errcode = 'P0001'; end if;
  update public.subscriptions
     set status = 'suspended', suspended_at = now(), suspended_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = v_s.id;
  perform private.write_audit(p_tenant, 'subscription.suspended', 'subscription', v_s.id,
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), '')));
end $$;

-- Reactivate a suspended subscription (keeps its existing period_end).
create or replace function public.reactivate_subscription(p_tenant uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_permission(p_tenant, 'settings.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.subscriptions
     set status = 'active', suspended_at = null, suspended_reason = null
   where tenant_id = p_tenant and status = 'suspended';
  perform private.write_audit(p_tenant, 'subscription.reactivated', 'tenant', p_tenant, '{}'::jsonb);
end $$;

-- Change plan (upgrade/downgrade) while PRESERVING remaining paid time: only the
-- plan and current_period_start move; the period end is untouched.
create or replace function public.change_plan(p_tenant uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.subscriptions;
begin
  if auth.uid() is null or not private.has_permission(p_tenant, 'settings.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where key = p_plan) then
    raise exception 'unknown_plan' using errcode = 'P0001'; end if;
  select * into v_s from private.live_subscription(p_tenant);
  if v_s.id is null then raise exception 'no_subscription' using errcode = 'P0001'; end if;
  update public.subscriptions
     set plan_key = p_plan, current_period_start = now()
   where id = v_s.id;
  perform private.write_audit(p_tenant, 'subscription.plan_changed', 'subscription', v_s.id,
    jsonb_build_object('from', v_s.plan_key, 'to', p_plan, 'period_end_kept', v_s.current_period_end));
end $$;

-- 6. Entitlements gate: expired/suspended/cancelled kitchens get NO features,
--    which makes read-only enforcement automatic everywhere features are checked.
create or replace function public.tenant_entitlements(p_tenant uuid)
returns table (feature_key text, kind text, enabled boolean, limit_value bigint)
language sql stable security definer set search_path = '' as $$
  select f.key, f.kind,
         case when coalesce(h.computed_status, 'expired')
                   in ('trialing','active','expiring_soon','past_due')
              then coalesce(pf.enabled, false) else false end as enabled,
         case when coalesce(h.computed_status, 'expired')
                   in ('trialing','active','expiring_soon','past_due')
              then pf.limit_value else null end as limit_value
  from public.features f
  left join public.subscription_health h on h.tenant_id = p_tenant
  left join public.plan_features pf
    on pf.feature_key = f.key and pf.plan_key = h.plan_key
  where private.is_member(p_tenant) or private.is_platform_staff()
     or exists (select 1 from public.tenants t where t.id = p_tenant and t.status = 'active');
$$;
revoke all on function public.tenant_entitlements(uuid) from public;
grant execute on function public.tenant_entitlements(uuid) to anon, authenticated, service_role;

-- 7. Grants for the new RPCs.
revoke all on function public.activate_subscription(uuid, text, text, int),
  public.renew_subscription(uuid, text, int),
  public.suspend_subscription(uuid, text),
  public.reactivate_subscription(uuid),
  public.change_plan(uuid, text) from public, anon;
grant execute on function public.activate_subscription(uuid, text, text, int),
  public.renew_subscription(uuid, text, int),
  public.suspend_subscription(uuid, text),
  public.reactivate_subscription(uuid),
  public.change_plan(uuid, text) to authenticated;

