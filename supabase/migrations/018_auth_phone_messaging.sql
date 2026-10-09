-- 018: Kenyan phone enforcement, staff-account check (customer-only Google sign-in),
--      live payment updates, and the customer messaging system (receipts, order updates, welcome, refunds).

-- =====================================================================
-- 1. Phones are stored as +254XXXXXXXXX only
-- =====================================================================
create or replace function private.normalize_ke_phone(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when d ~ '^0[17][0-9]{8}$'     then '+254' || substr(d, 2)
    when d ~ '^[17][0-9]{8}$'      then '+254' || d
    when d ~ '^254[17][0-9]{8}$'   then '+' || d
    else null end
  from (select regexp_replace(regexp_replace(coalesce(p, ''), '[[:space:]().-]', '', 'g'), '^\+', '') as d) s;
$$;

create or replace function private.trg_nullable_ke_phone() returns trigger
language plpgsql set search_path = '' as $$
declare v_old text := to_jsonb(new) ->> tg_argv[0]; v_new text;
begin
  if v_old is null or btrim(v_old) = '' then
    new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], null));
    return new;
  end if;
  v_new := private.normalize_ke_phone(v_old);
  if v_new is null then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  new := jsonb_populate_record(new, jsonb_build_object(tg_argv[0], v_new));
  return new;
end $$;

create or replace function private.trg_order_phone() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.contact_phone := private.normalize_ke_phone(new.contact_phone);
  if new.contact_phone is null then raise exception 'invalid_phone' using errcode = 'P0001'; end if;
  return new;
end $$;

-- Normalise what is already stored (only rows that can be normalised; others are left for the owner to fix).
update public.kitchen_customers set phone = private.normalize_ke_phone(phone)
 where phone is not null and private.normalize_ke_phone(phone) is not null and phone <> private.normalize_ke_phone(phone);
update public.tenant_notification_settings set kitchen_alert_phone = private.normalize_ke_phone(kitchen_alert_phone)
 where kitchen_alert_phone is not null and private.normalize_ke_phone(kitchen_alert_phone) is not null
   and kitchen_alert_phone <> private.normalize_ke_phone(kitchen_alert_phone);

create trigger kitchen_customers_phone before insert or update of phone on public.kitchen_customers
  for each row execute function private.trg_nullable_ke_phone('phone');
create trigger tenant_notification_phone before insert or update of kitchen_alert_phone on public.tenant_notification_settings
  for each row execute function private.trg_nullable_ke_phone('kitchen_alert_phone');
create trigger orders_contact_phone before insert on public.orders
  for each row execute function private.trg_order_phone();

-- =====================================================================
-- 2. Staff / admin accounts cannot use the customer Google sign-in
-- =====================================================================
create or replace function public.is_staff_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tenant_members m where m.user_id = (select auth.uid()) and m.is_active)
      or private.is_platform_staff();
$$;
revoke all on function public.is_staff_account() from public, anon;
grant execute on function public.is_staff_account() to authenticated;

-- =====================================================================
-- 3. Instant payment results: customers receive their own payment rows over Realtime
-- =====================================================================
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments') then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- =====================================================================
-- 4. Messaging: receipts, order updates, welcome, refunds
-- =====================================================================
alter table public.tenant_notification_settings alter column customer_sms set default true;

create or replace function private.fmt_money(p_minor bigint, p_currency text) returns text
language sql immutable set search_path = '' as $$
  select p_currency || ' ' || to_char(p_minor / 100.0, 'FM999,999,990');
$$;

-- Returns {"email": "...", "sms": "..."} for a paid order.
create or replace function private.order_receipt(p_order uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders%rowtype; v_name text; v_ref text; v_items text; v_when text; v_email text; v_sms text;
begin
  select * into o from public.orders where id = p_order;
  if not found then return null; end if;
  select name into v_name from public.tenants where id = o.tenant_id;
  select provider_receipt into v_ref from public.payments
   where order_id = p_order and status = 'SUCCEEDED' order by completed_at desc nulls last limit 1;
  select string_agg(quantity || ' x ' || product_name, E'\n' order by id) into v_items from public.order_items where order_id = p_order;
  v_when := to_char(coalesce(o.paid_at, now()) at time zone 'Africa/Nairobi', 'DD Mon YYYY, HH24:MI');

  v_email := 'Receipt from ' || v_name || E'\n' ||
             'Order #' || o.order_number || ' - ' || v_when || E'\n\n' ||
             coalesce(v_items, '') || E'\n\n' ||
             'Subtotal: ' || private.fmt_money(o.subtotal_minor, o.currency) || E'\n' ||
             case when o.delivery_fee_minor > 0 then 'Delivery fee: ' || private.fmt_money(o.delivery_fee_minor, o.currency) || E'\n' else '' end ||
             'Total paid: ' || private.fmt_money(o.total_minor, o.currency) || E'\n' ||
             'Paid with M-Pesa' || coalesce(' - reference ' || v_ref, '') || E'\n' ||
             case o.fulfilment::text when 'delivery' then 'Delivery' else 'Pickup' end || ' order';
  v_sms := v_name || ': Paid ' || private.fmt_money(o.total_minor, o.currency) || ' for order #' || o.order_number ||
           coalesce('. M-Pesa ref ' || v_ref, '') || '.';
  return jsonb_build_object('email', v_email, 'sms', v_sms);
end $$;
revoke all on function private.order_receipt(uuid) from public, anon, authenticated;

create or replace function private.notify_order_change(
  p_tenant uuid, p_order uuid, p_customer uuid, p_number bigint, p_to public.order_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid; v_title text; v_kitchen_title text; v_body text; v_sms text; v_receipt jsonb;
  v_kitchen text; v_fulfil text; v_data jsonb;
begin
  select user_id into v_user from public.kitchen_customers where id = p_customer and tenant_id = p_tenant;
  select name into v_kitchen from public.tenants where id = p_tenant;
  select fulfilment::text into v_fulfil from public.orders where id = p_order;

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

  v_body := case p_to
    when 'RECEIVED'       then 'We have your order and the kitchen has been told.'
    when 'ACCEPTED'       then 'The kitchen accepted your order and will start preparing it soon.'
    when 'PREPARING'      then 'Your food is being prepared right now.'
    when 'READY'          then case when v_fulfil = 'delivery' then 'Your order is ready and will be on its way shortly.' else 'Your order is ready for pickup.' end
    when 'COMPLETED'      then 'Thank you for ordering from ' || v_kitchen || '. We hope you enjoyed it!'
    when 'REJECTED'       then 'Sorry, the kitchen could not take this order. If you already paid, you will be refunded.'
    when 'CANCELLED'      then 'This order was cancelled. If you already paid, you will be refunded.'
    when 'PAYMENT_FAILED' then 'We could not collect your M-Pesa payment. Your order is saved: open it to try again.'
    else null end;

  -- Short SMS only for the moments that matter (receipt, ready, declined, cancelled, payment failed).
  v_sms := case p_to
    when 'READY'          then v_kitchen || ': Order #' || p_number || case when v_fulfil = 'delivery' then ' is ready and on its way.' else ' is ready for pickup.' end
    when 'REJECTED'       then v_kitchen || ': Sorry, order #' || p_number || ' was declined. Any payment will be refunded.'
    when 'CANCELLED'      then v_kitchen || ': Order #' || p_number || ' was cancelled. Any payment will be refunded.'
    when 'PAYMENT_FAILED' then v_kitchen || ': Payment for order #' || p_number || ' did not go through. Open your order to try again.'
    else null end;

  if p_to = 'PAID' then
    v_receipt := private.order_receipt(p_order);
    v_body := v_receipt ->> 'email'; v_sms := v_receipt ->> 'sms';
  end if;

  if v_title is not null and v_user is not null then
    v_data := jsonb_build_object('order_id', p_order) || case when v_sms is not null then jsonb_build_object('sms', v_sms) else '{}'::jsonb end;
    insert into public.notifications (tenant_id, audience, recipient_user_id, kind, title, body, data)
    values (p_tenant, 'customer', v_user, 'order.' || lower(p_to::text), v_title, v_body, v_data);
  end if;

  v_kitchen_title := case p_to
    when 'RECEIVED'  then 'New order #' || p_number
    when 'PAID'      then 'Payment received for order #' || p_number
    when 'CANCELLED' then 'Order #' || p_number || ' was cancelled'
    else null end;
  if v_kitchen_title is not null then
    insert into public.notifications (tenant_id, audience, kind, title, data)
    values (p_tenant, 'kitchen', 'order.' || lower(p_to::text), v_kitchen_title, jsonb_build_object('order_id', p_order));
  end if;
end $$;

create or replace function private.enqueue_deliveries() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenants%rowtype; v_host text; v_proto text; v_link text; v_cap int; v_today int;
  v_c_email boolean; v_c_sms boolean; v_k_email boolean; v_k_sms boolean; v_phone text;
  v_email text; v_cphone text; v_sms_ok boolean; v_order_phone text; v_essential boolean;
begin
  begin  -- delivery problems must never break order or payment processing
    select * into t from public.tenants where id = new.tenant_id;
    select customer_email, customer_sms, kitchen_email, kitchen_sms, kitchen_alert_phone
      into v_c_email, v_c_sms, v_k_email, v_k_sms, v_phone
      from public.tenant_notification_settings where tenant_id = new.tenant_id;
    if not found then v_c_email := true; v_c_sms := true; v_k_email := true; v_k_sms := false; v_phone := null; end if;

    select hostname into v_host from public.tenant_domains where tenant_id = new.tenant_id and is_primary limit 1;
    v_proto := case when v_host is null or v_host like 'localhost%' or v_host like '%.localhost%' then 'http' else 'https' end;
    select coalesce((select (value #>> '{}')::int from public.platform_settings where key = 'sms_daily_cap_per_kitchen'), 200) into v_cap;
    select count(*) into v_today from public.notification_deliveries where tenant_id = new.tenant_id and channel = 'sms' and created_at > now() - interval '1 day';
    -- Receipts and payment failures are essential: they go out on every plan (still subject to the daily cap).
    v_essential := new.kind in ('order.paid', 'order.payment_failed', 'order.refunded');
    v_sms_ok := (private.has_feature(new.tenant_id, 'advanced_notifications') or v_essential) and v_today < v_cap;

    if new.audience = 'customer' and new.recipient_user_id is not null then
      select email::text, phone into v_email, v_cphone from public.kitchen_customers where tenant_id = new.tenant_id and user_id = new.recipient_user_id;
      if new.data ? 'order_id' then
        select contact_phone into v_order_phone from public.orders where id = (new.data ->> 'order_id')::uuid;
      end if;
      v_link := case when new.data ? 'order_id' and v_host is not null then v_proto || '://' || v_host || '/orders/' || (new.data ->> 'order_id') else null end;
      if v_c_email and v_email is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, subject, body)
        values (new.tenant_id, new.id, 'email', v_email,
                case when new.kind = 'order.paid' then 'Your receipt - ' || t.name else new.title || ' - ' || t.name end,
                coalesce(new.body, new.title) || E'\n\n' || coalesce('View your order: ' || v_link || E'\n\n', '') || t.name);
      end if;
      if v_c_sms and v_sms_ok and new.data ? 'sms' and coalesce(v_order_phone, v_cphone) is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, body)
        values (new.tenant_id, new.id, 'sms', coalesce(v_order_phone, v_cphone), left((new.data ->> 'sms') || coalesce(' ' || v_link, ''), 300));
      end if;
    elsif new.audience = 'kitchen' then
      v_link := case when v_host is not null then v_proto || '://' || v_host || '/dashboard/orders' else null end;
      if v_k_email and t.contact_email is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, subject, body)
        values (new.tenant_id, new.id, 'email', t.contact_email, new.title, new.title || E'\n\n' || coalesce('Open the order board: ' || v_link, ''));
      end if;
      if v_k_sms and v_sms_ok and v_phone is not null then
        insert into public.notification_deliveries (tenant_id, notification_id, channel, to_address, body)
        values (new.tenant_id, new.id, 'sms', v_phone, left(new.title || coalesce('. ' || v_link, ''), 300));
      end if;
    end if;
  exception when others then
    raise warning 'enqueue_deliveries failed: %', sqlerrm;
  end;
  return new;
end $$;

-- Welcome message when a customer account is created (email only: no SMS cost for this one).
create or replace function private.notify_customer_welcome() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  begin
    select name into v_name from public.tenants where id = new.tenant_id;
    insert into public.notifications (tenant_id, audience, recipient_user_id, kind, title, body, data)
    values (new.tenant_id, 'customer', new.user_id, 'account.welcome', 'Welcome to ' || v_name,
            'Your account is ready. Browse the menu and order in a few taps. We will send your receipts and order updates by email and SMS.', '{}'::jsonb);
  exception when others then raise warning 'welcome notification failed: %', sqlerrm; end;
  return new;
end $$;
revoke all on function private.notify_customer_welcome() from public, anon, authenticated;
create trigger kitchen_customers_welcome after insert on public.kitchen_customers
  for each row execute function private.notify_customer_welcome();

-- Refund confirmation (email + SMS).
create or replace function private.notify_refund() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_num bigint; v_name text; v_amount text; v_sms text;
begin
  if old.refunded_at is null and new.refunded_at is not null then
    begin
      select kc.user_id, o.order_number, t.name, private.fmt_money(new.amount_minor, new.currency)
        into v_user, v_num, v_name, v_amount
        from public.orders o join public.kitchen_customers kc on kc.id = o.kitchen_customer_id and kc.tenant_id = o.tenant_id
        join public.tenants t on t.id = o.tenant_id where o.id = new.order_id;
      if v_user is not null then
        v_sms := v_name || ': ' || v_amount || ' for order #' || v_num || ' has been refunded to your M-Pesa.';
        insert into public.notifications (tenant_id, audience, recipient_user_id, kind, title, body, data)
        values (new.tenant_id, 'customer', v_user, 'order.refunded', 'Refund sent for order #' || v_num,
                v_amount || ' has been refunded to your M-Pesa number' || coalesce(' (reference ' || new.refund_reference || ')', '') || '. It can take a few minutes to show on your phone.',
                jsonb_build_object('order_id', new.order_id, 'sms', v_sms));
      end if;
    exception when others then raise warning 'refund notification failed: %', sqlerrm; end;
  end if;
  return new;
end $$;
revoke all on function private.notify_refund() from public, anon, authenticated;
create trigger payments_refund_notice after update of refunded_at on public.payments
  for each row execute function private.notify_refund();
