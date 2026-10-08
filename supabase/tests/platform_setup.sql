-- Behavioural tests: first-run platform setup (017_platform_setup.sql).
-- Run against a LOCAL/DISPOSABLE database only (it inserts users):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/platform_setup.sql
-- Raises an exception on the first failed assertion; prints PASS lines otherwise.
begin;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p)::text, true);
  execute 'set local role ' || case when p is null then 'anon' else 'authenticated' end;
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; end $$;
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;
create or replace function pg_temp.raises(stmt text, expected text) returns boolean language plpgsql as $$
begin execute stmt; return false;
exception when others then return position(expected in sqlerrm) > 0 or sqlstate = expected; end $$;

-- fixtures
insert into auth.users (id, email) values
 ('b0000000-0000-0000-0000-000000000001','first-admin@x.test'),
 ('b0000000-0000-0000-0000-000000000002','impostor@x.test');

-- fresh database => setup required (visible to anon despite RLS, via security definer)
select pg_temp.as_user(null);
select pg_temp.assert(public.platform_setup_required(), 'fresh database requires setup');

-- an authenticated user claims ownership
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select public.claim_platform_ownership();
select pg_temp.reset();
select pg_temp.assert(
  exists (select 1 from public.platform_staff where user_id = 'b0000000-0000-0000-0000-000000000001' and role = 'owner'),
  'first user becomes platform owner');

-- setup is closed for everyone else
select pg_temp.as_user(null);
select pg_temp.assert(not public.platform_setup_required(), 'setup closed after first claim');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000002');
select pg_temp.assert(pg_temp.raises('select public.claim_platform_ownership()', 'setup_completed'),
  'second claim rejected');
select pg_temp.reset();
select pg_temp.assert(
  not exists (select 1 from public.platform_staff where user_id = 'b0000000-0000-0000-0000-000000000002'),
  'impostor never becomes staff');

-- the original owner cannot be bootstrapped twice either (claim path is closed)
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises('select public.claim_platform_ownership()', 'setup_completed'),
  'repeat claim rejected');

-- anonymous callers have no execute grant at all
select pg_temp.as_user(null);
select pg_temp.assert(pg_temp.raises('select public.claim_platform_ownership()', '42501'),
  'anonymous claim rejected');

select pg_temp.reset();
commit;
