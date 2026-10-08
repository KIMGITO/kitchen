-- 002: profiles (global identity, deliberately minimal)
-- Kitchen-specific customer data lives in kitchen_customers, never here.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id,
          nullif(new.raw_user_meta_data ->> 'full_name', ''),
          nullif(new.raw_user_meta_data ->> 'phone', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Platform staff (separate from kitchen membership)
create type public.platform_role as enum ('owner', 'admin', 'support');

create table public.platform_staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.platform_role not null,
  created_at  timestamptz not null default now()
);

create or replace function private.is_platform_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff where user_id = auth.uid());
$$;

-- Admin = owner or admin (can mutate). Support is read-only.
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff
                 where user_id = auth.uid() and role in ('owner','admin'));
$$;

create or replace function private.is_platform_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff
                 where user_id = auth.uid() and role = 'owner');
$$;
