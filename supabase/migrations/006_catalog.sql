-- 006: catalog, addresses, promotions, media assets
-- Every child table carries tenant_id and uses composite FKs (tenant_id, parent_id),
-- so the database physically cannot link rows across kitchens.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9-]{1,80}$'),
  name        text not null check (length(name) between 1 and 80),
  description text,
  image_url   text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (tenant_id, id)
);
create unique index categories_tenant_slug on public.categories (tenant_id, slug) where deleted_at is null;
create trigger categories_updated_at before update on public.categories
  for each row execute function private.set_updated_at();

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  category_id     uuid,
  slug            text not null check (slug ~ '^[a-z0-9-]{1,100}$'),
  name            text not null check (length(name) between 1 and 120),
  description     text,
  image_url       text,
  price_minor     bigint not null check (price_minor >= 0),
  prep_minutes    int check (prep_minutes is null or prep_minutes > 0),
  calories        int check (calories is null or calories >= 0),
  is_available    boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, category_id) references public.categories (tenant_id, id)
);
create unique index products_tenant_slug on public.products (tenant_id, slug) where deleted_at is null;
create index products_tenant_category on public.products (tenant_id, category_id, sort_order) where deleted_at is null;
create index products_name_trgm on public.products using gin (name gin_trgm_ops);
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();

create table public.product_option_groups (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  product_id    uuid not null,
  name          text not null,
  min_select    int not null default 0 check (min_select >= 0),
  max_select    int not null default 1 check (max_select >= 1),
  sort_order    int not null default 0,
  check (max_select >= min_select),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id) on delete cascade
);
create index product_option_groups_product on public.product_option_groups (tenant_id, product_id);

create table public.product_options (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  group_id            uuid not null,
  name                text not null,
  price_delta_minor   bigint not null default 0 check (price_delta_minor >= 0),
  is_available        boolean not null default true,
  sort_order          int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, group_id) references public.product_option_groups (tenant_id, id) on delete cascade
);
create index product_options_group on public.product_options (tenant_id, group_id);

create table public.customer_addresses (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  kitchen_customer_id   uuid not null,
  label                 text,
  address_line          text not null,
  area                  text,
  instructions          text,
  latitude              numeric(9,6),
  longitude             numeric(9,6),
  is_default            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, kitchen_customer_id) references public.kitchen_customers (tenant_id, id) on delete cascade
);
create index customer_addresses_customer on public.customer_addresses (tenant_id, kitchen_customer_id) where deleted_at is null;
create trigger customer_addresses_updated_at before update on public.customer_addresses
  for each row execute function private.set_updated_at();

create table public.promotions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  title           text not null,
  subtitle        text,
  image_url       text,
  product_id      uuid,
  discount_percent int check (discount_percent between 1 and 100),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  foreign key (tenant_id, product_id) references public.products (tenant_id, id)
);
create index promotions_tenant_active on public.promotions (tenant_id, is_active, ends_at);
create trigger promotions_updated_at before update on public.promotions
  for each row execute function private.set_updated_at();

-- Tracks every uploaded image (quota enforcement, orphan cleanup).
create table public.media_assets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  bucket       text not null,
  path         text not null,
  mime_type    text not null,
  bytes        bigint not null check (bytes > 0),
  width        int,
  height       int,
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (bucket, path)
);
create index media_assets_tenant on public.media_assets (tenant_id, created_at desc);
