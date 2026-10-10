-- 019: notification management (mark read/unread, mark all, delete) + 2 MB image ceiling.
-- All functions are SECURITY DEFINER with the same recipient rule as mark_notifications_read (010):
--   a customer/staff member can act on rows addressed to them, and staff with orders.view can act on shared
--   kitchen alerts (recipient_user_id is null). Shared kitchen alerts have ONE read state for the whole team.

create or replace function public.set_notifications_read(p_tenant uuid, p_ids uuid[], p_read boolean)
returns void language sql security definer set search_path = '' as $$
  update public.notifications
     set read_at = case when p_read then coalesce(read_at, now()) else null end
   where id = any(p_ids) and tenant_id = p_tenant
     and (recipient_user_id = (select auth.uid())
          or (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view')));
$$;

create or replace function public.mark_all_notifications_read(p_tenant uuid, p_audience public.notification_audience)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where tenant_id = p_tenant and audience = p_audience and read_at is null
     and (recipient_user_id = (select auth.uid())
          or (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view')));
$$;

create or replace function public.delete_notifications(p_tenant uuid, p_ids uuid[])
returns integer language sql security definer set search_path = '' as $$
  with d as (
    delete from public.notifications
     where id = any(p_ids) and tenant_id = p_tenant
       and (recipient_user_id = (select auth.uid())
            or (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view')))
    returning 1)
  select count(*)::int from d;
$$;

create or replace function public.delete_read_notifications(p_tenant uuid, p_audience public.notification_audience)
returns integer language sql security definer set search_path = '' as $$
  with d as (
    delete from public.notifications
     where tenant_id = p_tenant and audience = p_audience and read_at is not null
       and (recipient_user_id = (select auth.uid())
            or (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view')))
    returning 1)
  select count(*)::int from d;
$$;

revoke all on function public.set_notifications_read(uuid, uuid[], boolean) from public, anon;
revoke all on function public.mark_all_notifications_read(uuid, public.notification_audience) from public, anon;
revoke all on function public.delete_notifications(uuid, uuid[]) from public, anon;
revoke all on function public.delete_read_notifications(uuid, public.notification_audience) from public, anon;
grant execute on function public.set_notifications_read(uuid, uuid[], boolean) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid, public.notification_audience) to authenticated;
grant execute on function public.delete_notifications(uuid, uuid[]) to authenticated;
grant execute on function public.delete_read_notifications(uuid, public.notification_audience) to authenticated;

-- Uploaded images are capped at 2 MB everywhere (avatars stay at 1 MB). The browser enforces this too.
update storage.buckets set file_size_limit = 2097152 where id in ('kitchen-branding', 'promo-images', 'product-images');
