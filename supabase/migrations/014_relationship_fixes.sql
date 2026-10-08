-- 014: direct foreign keys so the Supabase REST API can embed related rows (e.g. payments -> tenants, members -> profiles)
alter table public.payments add constraint payments_tenant_fk foreign key (tenant_id) references public.tenants(id);
alter table public.payment_events add constraint payment_events_tenant_fk foreign key (tenant_id) references public.tenants(id);

-- Every auth user gets a profile via trigger; backfill any that predate it, then link.
insert into public.profiles (id)
  select u.id from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
alter table public.tenant_members add constraint tenant_members_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.platform_staff add constraint platform_staff_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.kitchen_customers add constraint kitchen_customers_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;

-- Platform support/admin staff can read profiles of kitchen staff (names in the admin console).
-- (profiles_self_select already allows platform staff; nothing further needed.)
