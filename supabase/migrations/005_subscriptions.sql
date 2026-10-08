-- 005: plans, features, entitlements
create table public.features (
  key          text primary key,
  description  text not null,
  kind         text not null check (kind in ('flag','limit'))
);

create table public.plans (
  key           text primary key,
  name          text not null,
  price_minor   bigint not null default 0 check (price_minor >= 0),
  currency      char(3) not null default 'KES',
  billing_interval text not null default 'month' check (billing_interval in ('month','year')),
  is_active     boolean not null default true,
  sort_order    int not null default 0
);

create table public.plan_features (
  plan_key      text not null references public.plans(key) on delete cascade,
  feature_key   text not null references public.features(key) on delete cascade,
  enabled       boolean not null default true,
  limit_value   bigint,                         -- null on a 'limit' feature = unlimited
  primary key (plan_key, feature_key)
);

create type public.subscription_status as enum ('trialing','active','past_due','cancelled','expired');

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  plan_key              text not null references public.plans(key),
  status                public.subscription_status not null default 'trialing',
  current_period_start  timestamptz not null default now(),
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index subscriptions_one_live_per_tenant on public.subscriptions (tenant_id)
  where status in ('trialing','active','past_due');
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

-- Reference data (configuration, not demo data). Editable by platform admins afterwards.
insert into public.features (key, description, kind) values
  ('storefront',          'Branded kitchen storefront', 'flag'),
  ('order_notifications', 'Basic order notifications', 'flag'),
  ('basic_reports',       'Basic reporting', 'flag'),
  ('advanced_analytics',  'Advanced analytics', 'flag'),
  ('advanced_reports',    'Advanced reporting', 'flag'),
  ('promotions',          'Promotions and flash deals', 'flag'),
  ('advanced_customers',  'Advanced customer management', 'flag'),
  ('advanced_notifications','Advanced notifications', 'flag'),
  ('custom_theme',        'Extended storefront customisation', 'flag'),
  ('custom_domain',       'Custom domain', 'flag'),
  ('business_intelligence','Advanced business intelligence', 'flag'),
  ('automation',          'Advanced automation', 'flag'),
  ('financial_reports',   'Advanced financial reporting', 'flag'),
  ('integrations',        'Advanced integrations', 'flag'),
  ('max_staff',           'Maximum active staff', 'limit'),
  ('max_products',        'Maximum products', 'limit'),
  ('max_storage_mb',      'Maximum media storage (MB)', 'limit');

insert into public.plans (key, name, price_minor, sort_order) values
  ('basic', 'Basic', 0, 1), ('advanced', 'Advanced', 0, 2), ('pro', 'Pro', 0, 3);
-- Prices are set by platform admins in the admin panel.

insert into public.plan_features (plan_key, feature_key, enabled, limit_value) values
  ('basic','storefront',true,null),('basic','order_notifications',true,null),('basic','basic_reports',true,null),
  ('basic','max_staff',true,3),('basic','max_products',true,60),('basic','max_storage_mb',true,500),
  ('advanced','storefront',true,null),('advanced','order_notifications',true,null),('advanced','basic_reports',true,null),
  ('advanced','advanced_analytics',true,null),('advanced','advanced_reports',true,null),('advanced','promotions',true,null),
  ('advanced','advanced_customers',true,null),('advanced','advanced_notifications',true,null),('advanced','custom_theme',true,null),
  ('advanced','max_staff',true,10),('advanced','max_products',true,300),('advanced','max_storage_mb',true,2000),
  ('pro','storefront',true,null),('pro','order_notifications',true,null),('pro','basic_reports',true,null),
  ('pro','advanced_analytics',true,null),('pro','advanced_reports',true,null),('pro','promotions',true,null),
  ('pro','advanced_customers',true,null),('pro','advanced_notifications',true,null),('pro','custom_theme',true,null),
  ('pro','custom_domain',true,null),('pro','business_intelligence',true,null),('pro','automation',true,null),
  ('pro','financial_reports',true,null),('pro','integrations',true,null),
  ('pro','max_staff',true,null),('pro','max_products',true,null),('pro','max_storage_mb',true,20000);

create or replace function private.tenant_plan(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select plan_key from public.subscriptions
  where tenant_id = p_tenant and status in ('trialing','active','past_due')
  limit 1;
$$;

create or replace function private.has_feature(p_tenant uuid, p_feature text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pf.enabled from public.plan_features pf
                   where pf.plan_key = private.tenant_plan(p_tenant) and pf.feature_key = p_feature), false);
$$;

-- Returns null when unlimited; returns 0 when the feature isn't on the plan.
create or replace function private.feature_limit(p_tenant uuid, p_feature text)
returns bigint language sql stable security definer set search_path = '' as $$
  select case when pf.plan_key is null or not pf.enabled then 0 else pf.limit_value end
  from (select 1) x
  left join public.plan_features pf
    on pf.plan_key = private.tenant_plan(p_tenant) and pf.feature_key = p_feature;
$$;

-- All entitlements for a tenant, for the server to cache per request.
create or replace function public.tenant_entitlements(p_tenant uuid)
returns table (feature_key text, kind text, enabled boolean, limit_value bigint)
language sql stable security definer set search_path = '' as $$
  select f.key, f.kind, coalesce(pf.enabled, false), pf.limit_value
  from public.features f
  left join public.plan_features pf
    on pf.feature_key = f.key and pf.plan_key = private.tenant_plan(p_tenant)
  where private.is_member(p_tenant) or private.is_platform_staff()
     or exists (select 1 from public.tenants t where t.id = p_tenant and t.status = 'active');
$$;
revoke all on function public.tenant_entitlements(uuid) from public;
grant execute on function public.tenant_entitlements(uuid) to anon, authenticated, service_role;
