-- 010: audit log, notifications, kitchen onboarding, staff invitations

-- ---------- Audit log (append-only) ----------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  tenant_id    uuid references public.tenants(id) on delete set null,
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_tenant_created on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_action on public.audit_logs (action, created_at desc);

create or replace function private.block_audit_mutation()
returns trigger language plpgsql as $$
begin raise exception 'audit_logs is append-only' using errcode = '42501'; end $$;
create trigger audit_no_update before update or delete on public.audit_logs
  for each row execute function private.block_audit_mutation();

create or replace function private.write_audit(
  p_tenant uuid, p_action text, p_entity_type text, p_entity_id anyelement, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_tenant, auth.uid(), p_action, p_entity_type, p_entity_id::text, coalesce(p_meta, '{}'::jsonb));
$$;

-- ---------- Notifications ----------
create type public.notification_audience as enum ('customer','kitchen');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  audience        public.notification_audience not null,
  recipient_user_id uuid references auth.users(id) on delete cascade,  -- null on 'kitchen' = all staff with orders.view
  kind            text not null,
  title           text not null,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index notifications_recipient on public.notifications (tenant_id, recipient_user_id, created_at desc);
create index notifications_kitchen on public.notifications (tenant_id, audience, created_at desc);

-- Creates customer + kitchen notifications for an order status change.
-- External delivery (SMS/email/push) is handled later by the notification-dispatch Edge Function reading this table.
create or replace function private.notify_order_change(
  p_tenant uuid, p_order uuid, p_customer uuid, p_number bigint, p_to public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid; v_title text; v_kitchen_title text;
begin
  select user_id into v_user from public.kitchen_customers where id = p_customer and tenant_id = p_tenant;
  v_title := case p_to
    when 'RECEIVED'       then 'Order #' || p_number || ' received'
    when 'ACCEPTED'       then 'Order #' || p_number || ' accepted'
    when 'PREPARING'      then 'Order #' || p_number || ' is being prepared'
    when 'READY'          then 'Order #' || p_number || ' is ready'
    when 'COMPLETED'      then 'Order #' || p_number || ' completed'
    when 'REJECTED'       then 'Order #' || p_number || ' was declined'
    when 'CANCELLED'      then 'Order #' || p_number || ' was cancelled'
    when 'PAYMENT_FAILED' then 'Payment for order #' || p_number || ' failed'
    when 'PAID'           then 'Payment confirmed for order #' || p_number
    else null end;
  if v_title is not null and v_user is not null then
    insert into public.notifications (tenant_id, audience, recipient_user_id, kind, title, data)
    values (p_tenant, 'customer', v_user, 'order.' || lower(p_to::text), v_title,
            jsonb_build_object('order_id', p_order));
  end if;

  v_kitchen_title := case p_to
    when 'RECEIVED'  then 'New order #' || p_number
    when 'PAID'      then 'Payment received for order #' || p_number
    when 'CANCELLED' then 'Order #' || p_number || ' was cancelled'
    else null end;
  if v_kitchen_title is not null then
    insert into public.notifications (tenant_id, audience, kind, title, data)
    values (p_tenant, 'kitchen', 'order.' || lower(p_to::text), v_kitchen_title,
            jsonb_build_object('order_id', p_order));
  end if;
end $$;

create or replace function public.mark_notifications_read(p_tenant uuid, p_ids uuid[])
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where id = any(p_ids) and tenant_id = p_tenant and read_at is null
    and (recipient_user_id = auth.uid()
         or (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view')));
$$;
revoke all on function public.mark_notifications_read(uuid, uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid, uuid[]) to authenticated;

-- ---------- Kitchen onboarding ----------
-- A signed-in user registers a kitchen. It starts as pending_approval until a platform admin approves it.
create or replace function public.register_kitchen(p_slug text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_tenant uuid; v_root text; v_slug text := lower(trim(p_slug));
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' is not true then
    raise exception 'invalid_slug' using errcode = 'P0001'; end if;
  if exists (select 1 from public.platform_settings s, jsonb_array_elements_text(s.value) r
             where s.key = 'reserved_slugs' and r = v_slug) then
    raise exception 'reserved_slug' using errcode = 'P0001'; end if;
  select value #>> '{}' into v_root from public.platform_settings where key = 'root_domain';

  insert into public.tenants (slug, name) values (v_slug, trim(p_name)) returning id into v_tenant;
  insert into public.tenant_domains (tenant_id, hostname, is_primary, kind, verified_at)
  values (v_tenant, v_slug || '.' || v_root, true, 'subdomain', now());
  insert into public.tenant_members (tenant_id, user_id, role_key, created_by)
  values (v_tenant, v_uid, 'kitchen_admin', v_uid);
  insert into public.subscriptions (tenant_id, plan_key, status, current_period_end)
  values (v_tenant, 'basic', 'trialing', now() + interval '14 days');
  insert into public.tenant_themes (tenant_id) values (v_tenant);
  perform private.write_audit(v_tenant, 'kitchen.created', 'tenant', v_tenant, jsonb_build_object('slug', v_slug));
  return v_tenant;
end $$;
revoke all on function public.register_kitchen(text, text) from public;
grant execute on function public.register_kitchen(text, text) to authenticated;

create or replace function public.set_tenant_status(p_tenant uuid, p_status public.tenant_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.tenants set status = p_status,
    approved_at = case when p_status = 'active' then coalesce(approved_at, now()) else approved_at end,
    suspended_at = case when p_status = 'suspended' then now() else null end
  where id = p_tenant;
  perform private.write_audit(p_tenant, 'kitchen.status_changed', 'tenant', p_tenant, jsonb_build_object('status', p_status));
end $$;
revoke all on function public.set_tenant_status(uuid, public.tenant_status) from public;
grant execute on function public.set_tenant_status(uuid, public.tenant_status) to authenticated;

-- ---------- Staff management ----------
-- Returns the raw token ONCE; only its hash is stored. The server emails the link.
create or replace function public.invite_staff(p_tenant uuid, p_email text, p_role text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text; v_limit bigint; v_count bigint;
begin
  if not private.has_permission(p_tenant, 'staff.manage') then raise exception 'permission_denied' using errcode = '42501'; end if;
  v_limit := private.feature_limit(p_tenant, 'max_staff');
  select count(*) into v_count from public.tenant_members where tenant_id = p_tenant and is_active;
  if v_limit is not null and v_count >= v_limit then raise exception 'staff_limit_reached' using errcode = 'P0001'; end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.tenant_invitations (tenant_id, email, role_key, token_hash, invited_by)
  values (p_tenant, lower(trim(p_email)), p_role, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  perform private.write_audit(p_tenant, 'staff.invited', 'tenant', p_tenant, jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));
  return v_token;
end $$;
revoke all on function public.invite_staff(uuid, text, text) from public;
grant execute on function public.invite_staff(uuid, text, text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.tenant_invitations%rowtype; v_email text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_inv from public.tenant_invitations
   where token_hash = encode(digest(p_token, 'sha256'), 'hex') and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) <> lower(v_inv.email::text) then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;

  insert into public.tenant_members (tenant_id, user_id, role_key, created_by)
  values (v_inv.tenant_id, auth.uid(), v_inv.role_key, v_inv.invited_by)
  on conflict (tenant_id, user_id) do update set role_key = excluded.role_key, is_active = true;
  update public.tenant_invitations set status = 'accepted' where id = v_inv.id;
  perform private.write_audit(v_inv.tenant_id, 'staff.joined', 'tenant', v_inv.tenant_id, jsonb_build_object('role', v_inv.role_key));
  return v_inv.tenant_id;
end $$;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.update_staff_member(p_member uuid, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.tenant_members%rowtype; v_admins int;
begin
  select * into v_m from public.tenant_members where id = p_member for update;
  if not found or not private.has_permission(v_m.tenant_id, 'staff.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  select count(*) into v_admins from public.tenant_members
   where tenant_id = v_m.tenant_id and role_key = 'kitchen_admin' and is_active and id <> p_member;
  if v_m.role_key = 'kitchen_admin' and v_admins = 0 and (p_role <> 'kitchen_admin' or not p_active) then
    raise exception 'last_admin' using errcode = 'P0001'; end if;
  update public.tenant_members set role_key = p_role, is_active = p_active where id = p_member;
  perform private.write_audit(v_m.tenant_id, 'staff.updated', 'tenant_member', p_member,
          jsonb_build_object('role', p_role, 'active', p_active));
end $$;
revoke all on function public.update_staff_member(uuid, text, boolean) from public;
grant execute on function public.update_staff_member(uuid, text, boolean) to authenticated;
