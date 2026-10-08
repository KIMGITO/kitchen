-- 001: extensions, private schema, shared helpers
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- Security-definer helpers live in a schema that is NOT exposed through the API.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Returns null instead of raising for non-uuid input (used by storage policies).
create or replace function private.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;
