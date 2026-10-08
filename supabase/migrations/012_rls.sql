-- 012: Row Level Security + explicit grants
-- Strategy: default-deny. Revoke blanket table privileges, then grant only what each policy needs.
-- Financial/status tables have NO insert/update/delete policies: they change only through RPCs.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------- Profiles ----------
grant select, update (full_name, phone) on public.profiles to authenticated;
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_platform_staff());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Platform staff / settings ----------
grant select on public.platform_staff to authenticated;
create policy platform_staff_read on public.platform_staff for select to authenticated
  using (user_id = auth.uid() or private.is_platform_staff());
-- Only the owner role manages platform staff (via dashboard/service role during bootstrap).
grant insert, update, delete on public.platform_staff to authenticated;
create policy platform_staff_owner_write on public.platform_staff for all to authenticated
  using (private.is_platform_owner()) with check (private.is_platform_owner());

grant select on public.platform_settings to authenticated;
create policy platform_settings_read on public.platform_settings for select to authenticated using (private.is_platform_staff());
grant insert, update on public.platform_settings to authenticated;
create policy platform_settings_write on public.platform_settings for all to authenticated
  using (private.is_platform_owner()) with check (private.is_platform_owner());

-- ---------- Tenants ----------
grant select on public.tenants to anon, authenticated;
grant update (name, description, logo_url, cover_url, profile_url, contact_email, contact_phone, address_text,
              opening_hours, delivery_enabled, pickup_enabled, delivery_fee_minor, min_order_minor,
              seo_title, seo_description) on public.tenants to authenticated;
create policy tenants_public_read on public.tenants for select to anon, authenticated
  using (status = 'active' and deleted_at is null);
create policy tenants_member_read on public.tenants for select to authenticated
  using (private.is_member(id) or private.is_platform_staff());
create policy tenants_settings_update on public.tenants for update to authenticated
  using (private.has_permission(id, 'settings.manage'))
  with check (private.has_permission(id, 'settings.manage'));

grant select on public.tenant_domains to anon, authenticated;
create policy domains_public_read on public.tenant_domains for select to anon, authenticated
  using (exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active'));
create policy domains_member_read on public.tenant_domains for select to authenticated
  using (private.is_member(tenant_id) or private.is_platform_staff());

grant select, insert, update on public.tenant_themes to authenticated;
grant select on public.tenant_themes to anon;
create policy themes_public_read on public.tenant_themes for select to anon, authenticated
  using (exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active'));
create policy themes_write on public.tenant_themes for all to authenticated
  using (private.has_permission(tenant_id, 'settings.manage') and private.has_feature(tenant_id, 'custom_theme') or private.is_platform_admin())
  with check (private.has_permission(tenant_id, 'settings.manage') and private.has_feature(tenant_id, 'custom_theme') or private.is_platform_admin());

-- ---------- RBAC reference data ----------
grant select on public.permissions, public.roles, public.role_permissions to authenticated;
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- ---------- Staff & customers ----------
grant select on public.tenant_members to authenticated;
create policy members_read on public.tenant_members for select to authenticated
  using (user_id = auth.uid() or private.has_permission(tenant_id, 'staff.view') or private.is_platform_staff());

grant select on public.tenant_invitations to authenticated;
create policy invitations_read on public.tenant_invitations for select to authenticated
  using (private.has_permission(tenant_id, 'staff.manage') or private.is_platform_staff());

grant update (full_name, phone, marketing_opt_in) on public.kitchen_customers to authenticated;
create policy customers_self_read on public.kitchen_customers for select to authenticated using (user_id = auth.uid());
create policy customers_staff_read on public.kitchen_customers for select to authenticated
  using (private.has_permission(tenant_id, 'customers.view') or private.is_platform_staff());
create policy customers_self_update on public.kitchen_customers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- NOTE: staff_notes is kitchen-private. Customers must read through the column list below, not select *.
grant select (id, tenant_id, user_id, full_name, phone, email, status, marketing_opt_in, created_at, updated_at)
  on public.kitchen_customers to authenticated;
-- Staff read staff_notes through this security-invoker view-free RPC-less path:
create or replace function public.customer_staff_notes(p_customer uuid)
returns text language sql stable security definer set search_path = '' as $$
  select staff_notes from public.kitchen_customers
  where id = p_customer and private.has_permission(tenant_id, 'customers.view');
$$;
revoke all on function public.customer_staff_notes(uuid) from public;
grant execute on function public.customer_staff_notes(uuid) to authenticated;
create or replace function public.set_customer_notes(p_customer uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_t uuid;
begin
  select tenant_id into v_t from public.kitchen_customers where id = p_customer;
  if v_t is null or not private.has_permission(v_t, 'customers.manage') then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.kitchen_customers set staff_notes = p_notes where id = p_customer;
end $$;
revoke all on function public.set_customer_notes(uuid, text) from public;
grant execute on function public.set_customer_notes(uuid, text) to authenticated;

grant select, insert, update, delete on public.customer_addresses to authenticated;
create policy addresses_owner on public.customer_addresses for all to authenticated
  using (exists (select 1 from public.kitchen_customers kc where kc.id = kitchen_customer_id
                 and kc.tenant_id = customer_addresses.tenant_id and kc.user_id = auth.uid()))
  with check (exists (select 1 from public.kitchen_customers kc where kc.id = kitchen_customer_id
                 and kc.tenant_id = customer_addresses.tenant_id and kc.user_id = auth.uid()));
create policy addresses_staff_read on public.customer_addresses for select to authenticated
  using (private.has_permission(tenant_id, 'customers.view'));

-- ---------- Catalog ----------
grant select on public.categories, public.products, public.product_option_groups,
                public.product_options, public.promotions to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_option_groups,
                public.product_options, public.promotions to authenticated;

create policy categories_public on public.categories for select to anon, authenticated
  using (is_active and deleted_at is null
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active'));
create policy products_public on public.products for select to anon, authenticated
  using (deleted_at is null
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active'));
create policy option_groups_public on public.product_option_groups for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.tenant_id = product_option_groups.tenant_id
                 and p.deleted_at is null and exists (select 1 from public.tenants t where t.id = p.tenant_id and t.status = 'active')));
create policy options_public on public.product_options for select to anon, authenticated
  using (exists (select 1 from public.product_option_groups g where g.id = group_id and g.tenant_id = product_options.tenant_id
                 and exists (select 1 from public.products p where p.id = g.product_id and p.deleted_at is null
                             and exists (select 1 from public.tenants t where t.id = p.tenant_id and t.status = 'active'))));
create policy promotions_public on public.promotions for select to anon, authenticated
  using (is_active and starts_at <= now() and (ends_at is null or ends_at > now())
         and private.has_feature(tenant_id, 'promotions')
         and exists (select 1 from public.tenants t where t.id = tenant_id and t.status = 'active'));

-- Staff: read everything of their tenant (incl. soft-deleted/inactive), write with menu.manage.
create policy categories_staff_read on public.categories for select to authenticated using (private.has_permission(tenant_id, 'menu.view'));
create policy products_staff_read on public.products for select to authenticated using (private.has_permission(tenant_id, 'menu.view'));
create policy option_groups_staff_read on public.product_option_groups for select to authenticated using (private.has_permission(tenant_id, 'menu.view'));
create policy options_staff_read on public.product_options for select to authenticated using (private.has_permission(tenant_id, 'menu.view'));
create policy promotions_staff_read on public.promotions for select to authenticated using (private.has_permission(tenant_id, 'menu.view'));

create policy categories_staff_write on public.categories for all to authenticated
  using (private.has_permission(tenant_id, 'menu.manage')) with check (private.has_permission(tenant_id, 'menu.manage'));
create or replace function private.within_product_limit(p_tenant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.feature_limit(p_tenant, 'max_products') is null
      or (select count(*) from public.products where tenant_id = p_tenant and deleted_at is null)
         <= private.feature_limit(p_tenant, 'max_products'), false);
$$;
create policy products_staff_write on public.products for all to authenticated
  using (private.has_permission(tenant_id, 'menu.manage'))
  with check (private.has_permission(tenant_id, 'menu.manage') and private.within_product_limit(tenant_id));
create policy option_groups_staff_write on public.product_option_groups for all to authenticated
  using (private.has_permission(tenant_id, 'menu.manage')) with check (private.has_permission(tenant_id, 'menu.manage'));
create policy options_staff_write on public.product_options for all to authenticated
  using (private.has_permission(tenant_id, 'menu.manage')) with check (private.has_permission(tenant_id, 'menu.manage'));
create policy promotions_staff_write on public.promotions for all to authenticated
  using (private.has_permission(tenant_id, 'menu.manage') and private.has_feature(tenant_id, 'promotions'))
  with check (private.has_permission(tenant_id, 'menu.manage') and private.has_feature(tenant_id, 'promotions'));

grant select, insert, delete on public.media_assets to authenticated;
create policy media_read on public.media_assets for select to anon, authenticated
  using (bucket in ('kitchen-branding','product-images','promo-images') or private.is_member(tenant_id));
grant select on public.media_assets to anon;
create policy media_insert on public.media_assets for insert to authenticated
  with check (uploaded_by = auth.uid() and (
      (bucket = 'kitchen-branding' and private.has_permission(tenant_id, 'settings.manage'))
   or (bucket in ('product-images','promo-images') and private.has_permission(tenant_id, 'menu.manage'))));
create policy media_delete on public.media_assets for delete to authenticated
  using (private.has_permission(tenant_id, 'menu.manage') or private.has_permission(tenant_id, 'settings.manage'));

-- ---------- Orders (read-only via API; writes via RPC) ----------
grant select on public.orders, public.order_items, public.order_item_options, public.order_status_history to authenticated;
create policy orders_customer_read on public.orders for select to authenticated
  using (exists (select 1 from public.kitchen_customers kc where kc.id = kitchen_customer_id
                 and kc.tenant_id = orders.tenant_id and kc.user_id = auth.uid()));
create policy orders_staff_read on public.orders for select to authenticated
  using (private.has_permission(tenant_id, 'orders.view') or private.is_platform_staff());

create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.tenant_id = order_items.tenant_id));
create policy order_item_options_read on public.order_item_options for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id and i.tenant_id = order_item_options.tenant_id));
create policy order_history_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.tenant_id = order_status_history.tenant_id));
-- The subqueries above run under orders' own RLS, so they inherit customer/staff visibility.

grant select on public.order_transitions to authenticated;
create policy transitions_read on public.order_transitions for select to authenticated using (true);

-- ---------- Plans & subscriptions ----------
grant select on public.plans, public.features, public.plan_features to anon, authenticated;
create policy plans_read on public.plans for select to anon, authenticated using (is_active);
create policy features_read on public.features for select to anon, authenticated using (true);
create policy plan_features_read on public.plan_features for select to anon, authenticated using (true);
grant insert, update, delete on public.plans, public.features, public.plan_features to authenticated;
create policy plans_admin on public.plans for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy features_admin on public.features for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy plan_features_admin on public.plan_features for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());

grant select, insert, update on public.subscriptions to authenticated;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (private.has_permission(tenant_id, 'settings.manage') or private.is_platform_staff());
create policy subscriptions_admin on public.subscriptions for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

-- ---------- Money (read-only; writes via RPC / service role) ----------
grant select on public.commission_rules to authenticated;
create policy commission_read_admin on public.commission_rules for select to authenticated using (private.is_platform_staff());
create policy commission_read_own on public.commission_rules for select to authenticated
  using (scope = 'tenant' and private.has_permission(tenant_id, 'finance.view'));

grant select on public.payments to authenticated;
create policy payments_customer_read on public.payments for select to authenticated
  using (exists (select 1 from public.kitchen_customers kc where kc.id = kitchen_customer_id
                 and kc.tenant_id = payments.tenant_id and kc.user_id = auth.uid()));
create policy payments_staff_read on public.payments for select to authenticated
  using (private.has_permission(tenant_id, 'payments.view') or private.is_platform_staff());

grant select on public.payment_events to authenticated;
create policy payment_events_admin on public.payment_events for select to authenticated using (private.is_platform_staff());

grant select on public.ledger_entries to authenticated;
create policy ledger_staff_read on public.ledger_entries for select to authenticated
  using (private.has_permission(tenant_id, 'finance.view') or private.is_platform_staff());
grant select on public.kitchen_balances to authenticated;

grant select on public.payouts to authenticated;
create policy payouts_staff_read on public.payouts for select to authenticated
  using (private.has_permission(tenant_id, 'finance.view') or private.is_platform_staff());

-- ---------- Notifications ----------
grant select on public.notifications to authenticated;
create policy notifications_recipient on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid());
create policy notifications_kitchen on public.notifications for select to authenticated
  using (audience = 'kitchen' and private.has_permission(tenant_id, 'orders.view'));

-- ---------- Audit ----------
grant select on public.audit_logs to authenticated;
create policy audit_tenant_read on public.audit_logs for select to authenticated
  using ((tenant_id is not null and private.has_permission(tenant_id, 'settings.manage')) or private.is_platform_staff());

-- ---------- Realtime ----------
-- RLS applies to realtime changes, so subscribers only receive rows they can select.
alter publication supabase_realtime add table public.orders, public.order_status_history, public.notifications;
