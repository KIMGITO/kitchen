-- 007: orders, state machine, create_order / transition_order
-- The cart lives client-side (Zustand, per tenant). Prices are NEVER trusted from the client:
-- create_order recomputes every amount from the catalog.

create type public.order_status as enum (
  'PENDING_PAYMENT','PAYMENT_FAILED','PAID','RECEIVED','ACCEPTED','PREPARING',
  'READY','COMPLETED','CANCELLED','REJECTED','REFUNDED','EXPIRED');
create type public.fulfilment_type as enum ('pickup','delivery');

-- Single definition of legal transitions + who may perform them.
create table public.order_transitions (
  from_status     public.order_status not null,
  to_status       public.order_status not null,
  permission_key  text references public.permissions(key),
  allow_customer  boolean not null default false,
  system_only     boolean not null default false,
  primary key (from_status, to_status),
  check (system_only or permission_key is not null or allow_customer)
);
insert into public.order_transitions (from_status, to_status, permission_key, allow_customer, system_only) values
  ('PENDING_PAYMENT','PAID',            null, false, true),
  ('PENDING_PAYMENT','PAYMENT_FAILED',  null, false, true),
  ('PENDING_PAYMENT','EXPIRED',         null, false, true),
  ('PENDING_PAYMENT','CANCELLED',       null, true,  false),
  ('PAYMENT_FAILED', 'PENDING_PAYMENT', null, false, true),
  ('PAID',           'RECEIVED',        null, false, true),
  ('RECEIVED',       'ACCEPTED',        'orders.accept',  false, false),
  ('RECEIVED',       'REJECTED',        'orders.accept',  false, false),
  ('RECEIVED',       'CANCELLED',       'orders.cancel',  false, false),
  ('ACCEPTED',       'PREPARING',       'orders.prepare', false, false),
  ('ACCEPTED',       'CANCELLED',       'orders.cancel',  false, false),
  ('PREPARING',      'READY',           'orders.prepare', false, false),
  ('PREPARING',      'CANCELLED',       'orders.cancel',  false, false),
  ('READY',          'COMPLETED',       'orders.complete',false, false),
  ('READY',          'CANCELLED',       'orders.cancel',  false, false),
  ('REJECTED',       'REFUNDED',        null, false, true),
  ('CANCELLED',      'REFUNDED',        null, false, true);

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id),
  order_number          bigint not null,
  kitchen_customer_id   uuid not null,
  status                public.order_status not null default 'PENDING_PAYMENT',
  fulfilment            public.fulfilment_type not null,
  address_id            uuid,
  delivery_address_snapshot jsonb,
  contact_name          text not null,
  contact_phone         text not null,
  customer_notes        text,
  currency              char(3) not null,
  subtotal_minor        bigint not null check (subtotal_minor >= 0),
  delivery_fee_minor    bigint not null default 0 check (delivery_fee_minor >= 0),
  total_minor           bigint not null check (total_minor >= 0),
  -- Commission snapshot, written once when payment succeeds. Never recomputed.
  commission_rule_id    uuid,
  commission_enabled    boolean,
  commission_percent_bps int,
  commission_fixed_minor bigint,
  commission_minor      bigint check (commission_minor is null or commission_minor >= 0),
  kitchen_net_minor     bigint check (kitchen_net_minor is null or kitchen_net_minor >= 0),
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (total_minor = subtotal_minor + delivery_fee_minor),
  unique (tenant_id, id),
  unique (tenant_id, order_number),
  foreign key (tenant_id, kitchen_customer_id) references public.kitchen_customers (tenant_id, id),
  foreign key (tenant_id, address_id) references public.customer_addresses (tenant_id, id)
);
create index orders_tenant_created on public.orders (tenant_id, created_at desc);
create index orders_tenant_status on public.orders (tenant_id, status, created_at desc);
create index orders_customer on public.orders (tenant_id, kitchen_customer_id, created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  order_id           uuid not null,
  product_id         uuid,
  product_name       text not null,          -- snapshot
  unit_price_minor   bigint not null check (unit_price_minor >= 0),  -- includes option deltas
  quantity           int not null check (quantity between 1 and 99),
  line_total_minor   bigint not null check (line_total_minor >= 0),
  notes              text,
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references public.products (tenant_id, id)
);
create index order_items_order on public.order_items (tenant_id, order_id);

create table public.order_item_options (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  order_item_id       uuid not null,
  option_name         text not null,         -- snapshot
  price_delta_minor   bigint not null default 0,
  foreign key (tenant_id, order_item_id) references public.order_items (tenant_id, id) on delete cascade
);
create index order_item_options_item on public.order_item_options (tenant_id, order_item_id);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  tenant_id    uuid not null,
  order_id     uuid not null,
  from_status  public.order_status,
  to_status    public.order_status not null,
  actor_id     uuid references auth.users(id),
  actor_kind   text not null check (actor_kind in ('customer','staff','system')),
  note         text,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index order_status_history_order on public.order_status_history (tenant_id, order_id, created_at);

-- Internal: applies a transition with no authorisation. Callers MUST authorise first.
create or replace function private.apply_transition(
  p_order uuid, p_to public.order_status, p_actor uuid, p_actor_kind text, p_note text default null)
returns public.order_status language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.order_transitions
                 where from_status = v_order.status and to_status = p_to) then
    raise exception 'invalid_transition: % -> %', v_order.status, p_to using errcode = 'P0001';
  end if;

  update public.orders set status = p_to where id = p_order;
  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_id, actor_kind, note)
  values (v_order.tenant_id, p_order, v_order.status, p_to, p_actor, p_actor_kind, p_note);

  perform private.notify_order_change(v_order.tenant_id, p_order, v_order.kitchen_customer_id, v_order.order_number, p_to);
  return v_order.status;
end $$;
revoke all on function private.apply_transition(uuid, public.order_status, uuid, text, text) from public, anon, authenticated;

-- Public entry point for staff and customers.
create or replace function public.transition_order(p_order uuid, p_to public.order_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders%rowtype;
  v_rule  public.order_transitions%rowtype;
  v_uid   uuid := auth.uid();
  v_is_owner boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_order from public.orders where id = p_order;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select * into v_rule from public.order_transitions where from_status = v_order.status and to_status = p_to;
  if not found or v_rule.system_only then
    raise exception 'invalid_transition: % -> %', v_order.status, p_to using errcode = 'P0001';
  end if;

  if v_rule.permission_key is not null and private.has_permission(v_order.tenant_id, v_rule.permission_key) then
    perform private.apply_transition(p_order, p_to, v_uid, 'staff', p_note);
    perform private.write_audit(v_order.tenant_id, 'order.status_changed', 'order', p_order,
            jsonb_build_object('from', v_order.status, 'to', p_to));
    return;
  end if;

  select exists (select 1 from public.kitchen_customers
                 where id = v_order.kitchen_customer_id and tenant_id = v_order.tenant_id and user_id = v_uid)
    into v_is_owner;
  if v_rule.allow_customer and v_is_owner then
    perform private.apply_transition(p_order, p_to, v_uid, 'customer', p_note);
    return;
  end if;
  raise exception 'permission_denied' using errcode = '42501';
end $$;
revoke all on function public.transition_order(uuid, public.order_status, text) from public;
grant execute on function public.transition_order(uuid, public.order_status, text) to authenticated;

-- p_items: [{ "product_id": uuid, "quantity": int, "option_ids": [uuid], "notes": text }]
create or replace function public.create_order(
  p_tenant uuid, p_items jsonb, p_fulfilment public.fulfilment_type,
  p_address uuid default null, p_contact_name text default null,
  p_contact_phone text default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tenant public.tenants%rowtype;
  v_customer public.kitchen_customers%rowtype;
  v_order uuid;
  v_number bigint;
  v_item jsonb; v_prod public.products%rowtype;
  v_opt record; v_opt_id uuid;
  v_item_id uuid; v_qty int; v_unit bigint; v_subtotal bigint := 0; v_fee bigint := 0;
  v_group record; v_count int; v_addr jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_order' using errcode = 'P0001'; end if;

  select * into v_tenant from public.tenants
   where id = p_tenant and status = 'active' and deleted_at is null for update;
  if not found then raise exception 'kitchen_unavailable' using errcode = 'P0001'; end if;

  select * into v_customer from public.kitchen_customers
   where tenant_id = p_tenant and user_id = v_uid;
  if not found then raise exception 'no_customer_account' using errcode = 'P0001'; end if;
  if v_customer.status <> 'active' then raise exception 'customer_blocked' using errcode = '42501'; end if;

  if p_fulfilment = 'delivery' then
    if not v_tenant.delivery_enabled then raise exception 'delivery_unavailable' using errcode = 'P0001'; end if;
    select to_jsonb(a) - 'tenant_id' - 'kitchen_customer_id' into v_addr
      from public.customer_addresses a
     where a.id = p_address and a.tenant_id = p_tenant and a.kitchen_customer_id = v_customer.id and a.deleted_at is null;
    if v_addr is null then raise exception 'address_required' using errcode = 'P0001'; end if;
    v_fee := v_tenant.delivery_fee_minor;
  elsif not v_tenant.pickup_enabled then
    raise exception 'pickup_unavailable' using errcode = 'P0001';
  end if;

  v_number := v_tenant.next_order_number;
  update public.tenants set next_order_number = next_order_number + 1 where id = p_tenant;

  insert into public.orders (tenant_id, order_number, kitchen_customer_id, fulfilment, address_id,
      delivery_address_snapshot, contact_name, contact_phone, customer_notes, currency,
      subtotal_minor, delivery_fee_minor, total_minor)
  values (p_tenant, v_number, v_customer.id, p_fulfilment, p_address, v_addr,
      coalesce(nullif(trim(p_contact_name), ''), v_customer.full_name),
      coalesce(nullif(trim(p_contact_phone), ''), v_customer.phone, ''),
      nullif(trim(p_notes), ''), v_tenant.currency, 0, v_fee, v_fee)
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then raise exception 'invalid_quantity' using errcode = 'P0001'; end if;

    select * into v_prod from public.products
     where id = (v_item ->> 'product_id')::uuid and tenant_id = p_tenant
       and deleted_at is null and is_available;
    if not found then raise exception 'product_unavailable' using errcode = 'P0001'; end if;

    v_unit := v_prod.price_minor;
    insert into public.order_items (tenant_id, order_id, product_id, product_name, unit_price_minor, quantity, line_total_minor, notes)
    values (p_tenant, v_order, v_prod.id, v_prod.name, v_unit, v_qty, 0, nullif(trim(v_item ->> 'notes'), ''))
    returning id into v_item_id;

    -- Validate selected options against the product's option groups.
    for v_group in select * from public.product_option_groups where tenant_id = p_tenant and product_id = v_prod.id loop
      select count(*) into v_count
        from jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb)) s(oid)
        join public.product_options o on o.id = s.oid::uuid and o.group_id = v_group.id and o.tenant_id = p_tenant
       where o.is_available;
      if v_count < v_group.min_select or v_count > v_group.max_select then
        raise exception 'invalid_options: %', v_group.name using errcode = 'P0001'; end if;
    end loop;

    for v_opt_id in select s.oid::uuid from jsonb_array_elements_text(coalesce(v_item -> 'option_ids', '[]'::jsonb)) s(oid) loop
      select o.* into v_opt from public.product_options o
        join public.product_option_groups g on g.id = o.group_id and g.tenant_id = o.tenant_id
       where o.id = v_opt_id and o.tenant_id = p_tenant and g.product_id = v_prod.id and o.is_available;
      if not found then raise exception 'invalid_option' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.price_delta_minor;
      insert into public.order_item_options (tenant_id, order_item_id, option_name, price_delta_minor)
      values (p_tenant, v_item_id, v_opt.name, v_opt.price_delta_minor);
    end loop;

    update public.order_items set unit_price_minor = v_unit, line_total_minor = v_unit * v_qty where id = v_item_id;
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;

  if v_subtotal < v_tenant.min_order_minor then
    raise exception 'below_minimum_order' using errcode = 'P0001'; end if;

  update public.orders set subtotal_minor = v_subtotal, total_minor = v_subtotal + v_fee where id = v_order;
  insert into public.order_status_history (tenant_id, order_id, from_status, to_status, actor_id, actor_kind)
  values (p_tenant, v_order, null, 'PENDING_PAYMENT', v_uid, 'customer');
  return v_order;
end $$;
revoke all on function public.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) from public;
grant execute on function public.create_order(uuid, jsonb, public.fulfilment_type, uuid, text, text, text) to authenticated;
