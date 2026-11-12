-- Migration 001: profiles, vendors, purchase orders, goods receiving
-- Traceability start: Vendor → Purchase Order → Goods Receipt

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.is_authenticated()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (linked to Supabase Auth; credentials stay in auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null
    check (role in (
      'super_admin',
      'manager',
      'data_entry',
      'warehouse_staff',
      'warehouse_manager'
    )),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_email_unique unique (email)
);

create index profiles_role_idx on public.profiles (role);
create index profiles_is_active_idx on public.profiles (is_active);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

comment on table public.profiles is
  'SeaDock user profile and role. Authentication identity lives in auth.users.';

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null,
  vendor_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vendors_vendor_code_unique unique (vendor_code)
);

create index vendors_status_idx on public.vendors (status);
create index vendors_vendor_name_idx on public.vendors (vendor_name);

create trigger vendors_set_updated_at
before update on public.vendors
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Purchase orders (procurement)
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  po_date date not null default (timezone('utc', now()))::date,
  expected_date date,
  status text not null default 'draft'
    check (status in (
      'draft',
      'awaiting_verification',
      'confirmed',
      'partially_received',
      'received',
      'cancelled'
    )),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_orders_po_number_unique unique (po_number)
);

create index purchase_orders_vendor_id_idx on public.purchase_orders (vendor_id);
create index purchase_orders_status_idx on public.purchase_orders (status);
create index purchase_orders_po_date_idx on public.purchase_orders (po_date);

create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  product_species text not null,
  ordered_quantity numeric(14, 3) not null check (ordered_quantity > 0),
  unit text not null default 'kg',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index purchase_order_items_purchase_order_id_idx
  on public.purchase_order_items (purchase_order_id);

create trigger purchase_order_items_set_updated_at
before update on public.purchase_order_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Goods receiving
-- ---------------------------------------------------------------------------

create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  purchase_order_id uuid not null references public.purchase_orders (id) on delete restrict,
  received_at timestamptz not null default timezone('utc', now()),
  received_by uuid references public.profiles (id) on delete set null,
  driver_name text,
  vehicle_number text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'received', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint goods_receipts_receipt_number_unique unique (receipt_number)
);

create index goods_receipts_purchase_order_id_idx on public.goods_receipts (purchase_order_id);
create index goods_receipts_received_at_idx on public.goods_receipts (received_at);
create index goods_receipts_status_idx on public.goods_receipts (status);

create trigger goods_receipts_set_updated_at
before update on public.goods_receipts
for each row execute function public.set_updated_at();

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete restrict,
  purchase_order_item_id uuid not null references public.purchase_order_items (id) on delete restrict,
  received_quantity numeric(14, 3) not null check (received_quantity > 0),
  unit text not null default 'kg',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index goods_receipt_items_goods_receipt_id_idx
  on public.goods_receipt_items (goods_receipt_id);
create index goods_receipt_items_purchase_order_item_id_idx
  on public.goods_receipt_items (purchase_order_item_id);

create trigger goods_receipt_items_set_updated_at
before update on public.goods_receipt_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: secure defaults (no public access)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;

create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (public.is_authenticated());

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy vendors_select_authenticated
  on public.vendors for select to authenticated
  using (public.is_authenticated());

create policy vendors_write_authenticated
  on public.vendors for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy purchase_orders_select_authenticated
  on public.purchase_orders for select to authenticated
  using (public.is_authenticated());

create policy purchase_orders_write_authenticated
  on public.purchase_orders for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy purchase_order_items_select_authenticated
  on public.purchase_order_items for select to authenticated
  using (public.is_authenticated());

create policy purchase_order_items_write_authenticated
  on public.purchase_order_items for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy goods_receipts_select_authenticated
  on public.goods_receipts for select to authenticated
  using (public.is_authenticated());

create policy goods_receipts_write_authenticated
  on public.goods_receipts for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy goods_receipt_items_select_authenticated
  on public.goods_receipt_items for select to authenticated
  using (public.is_authenticated());

create policy goods_receipt_items_write_authenticated
  on public.goods_receipt_items for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());
