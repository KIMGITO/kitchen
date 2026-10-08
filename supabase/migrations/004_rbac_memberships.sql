-- 004: permissions, roles, staff memberships, kitchen customers, invitations
create table public.permissions (
  key          text primary key,
  description  text not null
);

create table public.roles (
  key          text primary key,
  name         text not null,
  description  text not null
);

create table public.role_permissions (
  role_key        text not null references public.roles(key) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

insert into public.permissions (key, description) values
  ('orders.view',      'View kitchen orders'),
  ('orders.accept',    'Accept or reject incoming orders'),
  ('orders.prepare',   'Mark orders preparing / ready'),
  ('orders.complete',  'Mark orders completed'),
  ('orders.cancel',    'Cancel orders'),
  ('menu.view',        'View menu management'),
  ('menu.manage',      'Create and edit categories, products and promotions'),
  ('customers.view',   'View kitchen customers'),
  ('customers.manage', 'Change customer status'),
  ('payments.view',    'View payment records'),
  ('finance.view',     'View ledger, commissions and payouts'),
  ('reports.view',     'View reports and analytics'),
  ('staff.view',       'View staff'),
  ('staff.manage',     'Invite staff, change roles, deactivate'),
  ('settings.manage',  'Edit kitchen settings and branding');

insert into public.roles (key, name, description) values
  ('kitchen_admin', 'Kitchen admin', 'Full control of the kitchen'),
  ('manager',       'Manager',       'Runs daily operations, menu and orders'),
  ('cashier',       'Cashier',       'Takes and completes orders, views payments'),
  ('worker',        'Kitchen worker','Prepares orders');

insert into public.role_permissions (role_key, permission_key)
  select 'kitchen_admin', key from public.permissions;
insert into public.role_permissions (role_key, permission_key) values
  ('manager','orders.view'),('manager','orders.accept'),('manager','orders.prepare'),
  ('manager','orders.complete'),('manager','orders.cancel'),('manager','menu.view'),
  ('manager','menu.manage'),('manager','customers.view'),('manager','customers.manage'),
  ('manager','payments.view'),('manager','finance.view'),('manager','reports.view'),
  ('manager','staff.view'),
  ('cashier','orders.view'),('cashier','orders.accept'),('cashier','orders.complete'),
  ('cashier','customers.view'),('cashier','payments.view'),
  ('worker','orders.view'),('worker','orders.prepare'),('worker','menu.view');

create table public.tenant_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role_key    text not null references public.roles(key),
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id) where is_active;
create trigger tenant_members_updated_at before update on public.tenant_members
  for each row execute function private.set_updated_at();

-- A person's relationship with ONE kitchen. Never shared across kitchens.
create type public.customer_status as enum ('active','blocked');

create table public.kitchen_customers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  full_name          text not null check (length(full_name) between 1 and 120),
  phone              text,
  email              citext,
  status             public.customer_status not null default 'active',
  marketing_opt_in   boolean not null default false,
  staff_notes        text,                      -- kitchen-private; not readable by the customer
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)                        -- target for composite FKs
);
create index kitchen_customers_tenant_idx on public.kitchen_customers (tenant_id, created_at desc);
create trigger kitchen_customers_updated_at before update on public.kitchen_customers
  for each row execute function private.set_updated_at();

create table public.tenant_invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  email        citext not null,
  role_key     text not null references public.roles(key),
  token_hash   text not null unique,
  status       text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by   uuid references auth.users(id),
  expires_at   timestamptz not null default now() + interval '7 days',
  created_at   timestamptz not null default now()
);
create index tenant_invitations_tenant_idx on public.tenant_invitations (tenant_id, status);

-- ---------- RLS helper functions ----------
create or replace function private.is_member(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_members
                 where tenant_id = p_tenant and user_id = auth.uid() and is_active);
$$;

create or replace function private.has_permission(p_tenant uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tenant_members m
    join public.role_permissions rp on rp.role_key = m.role_key
    where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.is_active
      and rp.permission_key = p_permission);
$$;

create or replace function private.is_customer_of(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.kitchen_customers
                 where tenant_id = p_tenant and user_id = auth.uid() and status = 'active');
$$;

-- Permissions for the current user in a tenant (consumed by the Next.js server).
create or replace function public.my_permissions(p_tenant uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(rp.permission_key order by rp.permission_key), '{}')
  from public.tenant_members m
  join public.role_permissions rp on rp.role_key = m.role_key
  where m.tenant_id = p_tenant and m.user_id = auth.uid() and m.is_active;
$$;
revoke all on function public.my_permissions(uuid) from public;
grant execute on function public.my_permissions(uuid) to authenticated;

-- ---------- Customer registration (explicit, per kitchen) ----------
create or replace function public.register_kitchen_customer(
  p_tenant uuid, p_full_name text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_email text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant and status = 'active' and deleted_at is null) then
    raise exception 'kitchen_unavailable' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = v_uid;

  insert into public.kitchen_customers (tenant_id, user_id, full_name, phone, email)
  values (p_tenant, v_uid, trim(p_full_name), nullif(trim(p_phone), ''), v_email)
  on conflict (tenant_id, user_id) do update set full_name = excluded.full_name
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.register_kitchen_customer(uuid, text, text) from public;
grant execute on function public.register_kitchen_customer(uuid, text, text) to authenticated;

create or replace function public.set_customer_status(p_customer uuid, p_status public.customer_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.kitchen_customers where id = p_customer;
  if v_tenant is null or not private.has_permission(v_tenant, 'customers.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  update public.kitchen_customers set status = p_status where id = p_customer;
  perform private.write_audit(v_tenant, 'customer.status_changed', 'kitchen_customer', p_customer,
                              jsonb_build_object('status', p_status));
end $$;
revoke all on function public.set_customer_status(uuid, public.customer_status) from public;
grant execute on function public.set_customer_status(uuid, public.customer_status) to authenticated;
