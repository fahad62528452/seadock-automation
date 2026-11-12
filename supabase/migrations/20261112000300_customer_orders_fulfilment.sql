-- Migration 003: customer purchase orders and fulfilment
-- Traceability: Inventory → Customer PO → Fulfilment (batch + inventory source preserved)

-- ---------------------------------------------------------------------------
-- Customer purchase orders
-- ---------------------------------------------------------------------------

create table public.customer_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_reference text,
  po_number text not null,
  po_date date,
  required_date date,
  status text not null default 'awaiting_verification'
    check (status in (
      'awaiting_verification',
      'verified',
      'pending_fulfilment',
      'partially_fulfilled',
      'fulfilled',
      'cancelled'
    )),
  source text not null default 'manual'
    check (source in ('manual', 'email', 'import')),
  received_at timestamptz not null default timezone('utc', now()),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_purchase_orders_po_number_unique unique (po_number)
);

create index customer_purchase_orders_status_idx
  on public.customer_purchase_orders (status);
create index customer_purchase_orders_customer_name_idx
  on public.customer_purchase_orders (customer_name);
create index customer_purchase_orders_received_at_idx
  on public.customer_purchase_orders (received_at);

create trigger customer_purchase_orders_set_updated_at
before update on public.customer_purchase_orders
for each row execute function public.set_updated_at();

create table public.customer_purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  customer_purchase_order_id uuid not null
    references public.customer_purchase_orders (id) on delete restrict,
  product_species text not null,
  requested_quantity numeric(14, 3) not null check (requested_quantity > 0),
  unit text not null default 'kg',
  fulfilled_quantity numeric(14, 3) not null default 0 check (fulfilled_quantity >= 0),
  status text not null default 'open'
    check (status in ('open', 'partially_fulfilled', 'fulfilled', 'cancelled')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_po_items_fulfilled_lte_requested
    check (fulfilled_quantity <= requested_quantity)
);

create index customer_purchase_order_items_cpo_id_idx
  on public.customer_purchase_order_items (customer_purchase_order_id);

create trigger customer_purchase_order_items_set_updated_at
before update on public.customer_purchase_order_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Fulfilment (preserves customer PO + inventory + batch relationship)
-- ---------------------------------------------------------------------------

create table public.fulfilments (
  id uuid primary key default gen_random_uuid(),
  fulfilment_number text not null,
  customer_purchase_order_id uuid not null
    references public.customer_purchase_orders (id) on delete restrict,
  fulfilled_at timestamptz not null default timezone('utc', now()),
  fulfilled_by uuid references public.profiles (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'dispatched', 'cancelled')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fulfilments_fulfilment_number_unique unique (fulfilment_number)
);

create index fulfilments_customer_purchase_order_id_idx
  on public.fulfilments (customer_purchase_order_id);
create index fulfilments_status_idx on public.fulfilments (status);
create index fulfilments_fulfilled_at_idx on public.fulfilments (fulfilled_at);

create trigger fulfilments_set_updated_at
before update on public.fulfilments
for each row execute function public.set_updated_at();

create table public.fulfilment_items (
  id uuid primary key default gen_random_uuid(),
  fulfilment_id uuid not null references public.fulfilments (id) on delete restrict,
  customer_purchase_order_item_id uuid not null
    references public.customer_purchase_order_items (id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  batch_id uuid not null references public.batches (id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit text not null default 'kg',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index fulfilment_items_fulfilment_id_idx
  on public.fulfilment_items (fulfilment_id);
create index fulfilment_items_inventory_item_id_idx
  on public.fulfilment_items (inventory_item_id);
create index fulfilment_items_batch_id_idx
  on public.fulfilment_items (batch_id);
create index fulfilment_items_cpo_item_id_idx
  on public.fulfilment_items (customer_purchase_order_item_id);

create trigger fulfilment_items_set_updated_at
before update on public.fulfilment_items
for each row execute function public.set_updated_at();

comment on table public.fulfilment_items is
  'Links fulfilled quantity to the inventory item and parent batch used for dispatch.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.customer_purchase_orders enable row level security;
alter table public.customer_purchase_order_items enable row level security;
alter table public.fulfilments enable row level security;
alter table public.fulfilment_items enable row level security;

create policy customer_purchase_orders_select_authenticated
  on public.customer_purchase_orders for select to authenticated
  using (public.is_authenticated());

create policy customer_purchase_orders_write_authenticated
  on public.customer_purchase_orders for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy customer_purchase_order_items_select_authenticated
  on public.customer_purchase_order_items for select to authenticated
  using (public.is_authenticated());

create policy customer_purchase_order_items_write_authenticated
  on public.customer_purchase_order_items for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy fulfilments_select_authenticated
  on public.fulfilments for select to authenticated
  using (public.is_authenticated());

create policy fulfilments_write_authenticated
  on public.fulfilments for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy fulfilment_items_select_authenticated
  on public.fulfilment_items for select to authenticated
  using (public.is_authenticated());

create policy fulfilment_items_write_authenticated
  on public.fulfilment_items for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());
