-- 003: tenants (kitchens), domains, themes, platform settings
create type public.tenant_status as enum ('pending_approval','active','suspended','closed');

create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz not null default now()
);
-- Root domain is configuration, set per environment: update platform_settings set value='"yourdomain.com"' where key='root_domain';
insert into public.platform_settings (key, value) values
  ('root_domain', '"localhost"'),
  ('reserved_slugs', '["www","admin","api","app","dashboard","support","mail","static","assets","cdn","help","status","billing"]');

create table public.tenants (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique
                        check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name                  text not null check (length(name) between 2 and 80),
  status                public.tenant_status not null default 'pending_approval',
  description           text,
  logo_url              text,
  cover_url             text,
  profile_url           text,
  contact_email         text,
  contact_phone         text,
  address_text          text,
  opening_hours         jsonb not null default '{}'::jsonb,
  currency              char(3) not null default 'KES',
  delivery_enabled      boolean not null default false,
  pickup_enabled        boolean not null default true,
  delivery_fee_minor    bigint not null default 0 check (delivery_fee_minor >= 0),
  min_order_minor       bigint not null default 0 check (min_order_minor >= 0),
  seo_title             text,
  seo_description       text,
  next_order_number     bigint not null default 1,
  approved_at           timestamptz,
  suspended_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);
create trigger tenants_updated_at before update on public.tenants
  for each row execute function private.set_updated_at();
create index tenants_status_idx on public.tenants (status) where deleted_at is null;

-- Domain mapping: platform subdomain now, custom domains later (same table).
create table public.tenant_domains (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  hostname     text not null unique check (hostname = lower(hostname)),
  is_primary   boolean not null default false,
  kind         text not null default 'subdomain' check (kind in ('subdomain','custom')),
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index tenant_domains_one_primary on public.tenant_domains (tenant_id) where is_primary;
create index tenant_domains_tenant_idx on public.tenant_domains (tenant_id);

-- Branding overrides, validated by the app against the theme token schema.
create table public.tenant_themes (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  overrides   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create trigger tenant_themes_updated_at before update on public.tenant_themes
  for each row execute function private.set_updated_at();

-- Public-safe tenant lookup by hostname (called by the Next.js server, never trusts the browser).
create or replace function public.resolve_tenant(p_hostname text)
returns table (
  id uuid, slug text, name text, status public.tenant_status, description text,
  logo_url text, cover_url text, profile_url text, currency char(3),
  delivery_enabled boolean, pickup_enabled boolean, delivery_fee_minor bigint,
  min_order_minor bigint, seo_title text, seo_description text,
  contact_email text, contact_phone text, address_text text, opening_hours jsonb,
  primary_hostname text, theme_overrides jsonb
)
language sql stable security definer set search_path = '' as $$
  select t.id, t.slug, t.name, t.status, t.description, t.logo_url, t.cover_url,
         t.profile_url, t.currency, t.delivery_enabled, t.pickup_enabled,
         t.delivery_fee_minor, t.min_order_minor, t.seo_title, t.seo_description,
         t.contact_email, t.contact_phone, t.address_text, t.opening_hours,
         (select d2.hostname from public.tenant_domains d2
           where d2.tenant_id = t.id and d2.is_primary limit 1),
         coalesce(th.overrides, '{}'::jsonb)
  from public.tenant_domains d
  join public.tenants t on t.id = d.tenant_id and t.deleted_at is null
  left join public.tenant_themes th on th.tenant_id = t.id
  where d.hostname = lower(p_hostname)
    and (d.kind = 'subdomain' or d.verified_at is not null)
  limit 1;
$$;
revoke all on function public.resolve_tenant(text) from public;
grant execute on function public.resolve_tenant(text) to anon, authenticated, service_role;
