-- 017: first-run platform setup.
-- The very first account on a fresh install claims ownership of the platform
-- (role 'owner') from the /setup page. Once ANY row exists in platform_staff
-- the claim is permanently closed — there is no code path to a second
-- bootstrap owner. Optional guard: the app refuses the claim when
-- PLATFORM_OWNER_EMAIL is set and the signed-in email does not match.

-- security definer: anon's RLS view of platform_staff is always empty, so the
-- page could never see that setup is done without bypassing RLS.
create or replace function public.platform_setup_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.platform_staff);
$$;

create or replace function public.claim_platform_ownership()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Serialise concurrent claims so exactly one winner exists.
  perform pg_advisory_xact_lock(hashtext('platform_setup'));
  if exists (select 1 from public.platform_staff) then
    raise exception 'setup_completed' using errcode = 'P0001';
  end if;
  insert into public.platform_staff (user_id, role) values (auth.uid(), 'owner');
end $$;

revoke all on function public.platform_setup_required() from public;
revoke all on function public.claim_platform_ownership() from public;
grant execute on function public.platform_setup_required() to anon, authenticated, service_role;
grant execute on function public.claim_platform_ownership() to authenticated;
