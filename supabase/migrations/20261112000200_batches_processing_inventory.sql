-- Migration 002: parent batches, processing runs, inventory + movements
-- Traceability: Goods Receipt → Parent Batch → Processing Run → Inventory

-- ---------------------------------------------------------------------------
-- Parent batches (central traceability identity)
-- ---------------------------------------------------------------------------

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete restrict,
  goods_receipt_item_id uuid references public.goods_receipt_items (id) on delete restrict,
  product_species text not null,
  received_quantity numeric(14, 3) not null check (received_quantity > 0),
  remaining_quantity numeric(14, 3) not null check (remaining_quantity >= 0),
  unit text not null default 'kg',
  received_at timestamptz not null default timezone('utc', now()),
  status text not null default 'active'
    check (status in (
      'active',
      'fresh',
      'frozen',
      'in_processing',
      'processed',
      'dispatched',
      'archived'
    )),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint batches_batch_number_unique unique (batch_number),
  constraint batches_remaining_lte_received
    check (remaining_quantity <= received_quantity)
);

create index batches_goods_receipt_id_idx on public.batches (goods_receipt_id);
create index batches_goods_receipt_item_id_idx on public.batches (goods_receipt_item_id);
create index batches_status_idx on public.batches (status);
create index batches_received_at_idx on public.batches (received_at);

create trigger batches_set_updated_at
before update on public.batches
for each row execute function public.set_updated_at();

comment on table public.batches is
  'Parent lot identity. Remains linked through processing, inventory, and fulfilment.';

-- ---------------------------------------------------------------------------
-- Processing runs (one parent batch may have many runs)
-- ---------------------------------------------------------------------------

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(),
  processing_run_number text not null,
  parent_batch_id uuid not null references public.batches (id) on delete restrict,
  processing_date date not null default (timezone('utc', now()))::date,
  input_quantity numeric(14, 3) not null check (input_quantity > 0),
  input_unit text not null default 'kg',
  processed_quantity numeric(14, 3) not null default 0 check (processed_quantity >= 0),
  wastage_quantity numeric(14, 3) not null default 0 check (wastage_quantity >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  processed_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint processing_runs_number_unique unique (processing_run_number),
  constraint processing_runs_yield_balance
    check (processed_quantity + wastage_quantity <= input_quantity)
);

create index processing_runs_parent_batch_id_idx on public.processing_runs (parent_batch_id);
create index processing_runs_status_idx on public.processing_runs (status);
create index processing_runs_processing_date_idx on public.processing_runs (processing_date);

create trigger processing_runs_set_updated_at
before update on public.processing_runs
for each row execute function public.set_updated_at();

comment on table public.processing_runs is
  'Processing against a parent batch. Yield and wastage stay attached to the run.';

-- ---------------------------------------------------------------------------
-- Inventory items (stock identities derived from batch / processing)
-- ---------------------------------------------------------------------------

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id) on delete restrict,
  processing_run_id uuid references public.processing_runs (id) on delete restrict,
  inventory_type text not null
    check (inventory_type in ('raw', 'processed', 'frozen', 'wastage')),
  product_species text not null,
  quantity numeric(14, 3) not null check (quantity >= 0),
  unit text not null default 'kg',
  status text not null default 'available'
    check (status in ('available', 'reserved', 'dispatched', 'archived')),
  storage_location text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index inventory_items_batch_id_idx on public.inventory_items (batch_id);
create index inventory_items_processing_run_id_idx on public.inventory_items (processing_run_id);
create index inventory_items_inventory_type_idx on public.inventory_items (inventory_type);
create index inventory_items_status_idx on public.inventory_items (status);

create trigger inventory_items_set_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

comment on table public.inventory_items is
  'Current stock identity. Wastage and processed yield are separate inventory rows linked to the processing run and parent batch.';

-- ---------------------------------------------------------------------------
-- Inventory movements (historical quantity changes)
-- ---------------------------------------------------------------------------

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  movement_type text not null
    check (movement_type in (
      'receipt',
      'transfer',
      'processing_input',
      'processing_output',
      'wastage',
      'dispatch',
      'adjustment',
      'reservation',
      'release'
    )),
  quantity numeric(14, 3) not null check (quantity <> 0),
  unit text not null default 'kg',
  reference_type text,
  reference_id uuid,
  previous_quantity numeric(14, 3) not null check (previous_quantity >= 0),
  new_quantity numeric(14, 3) not null check (new_quantity >= 0),
  performed_by uuid references public.profiles (id) on delete set null,
  performed_at timestamptz not null default timezone('utc', now()),
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index inventory_movements_inventory_item_id_idx
  on public.inventory_movements (inventory_item_id);
create index inventory_movements_movement_type_idx
  on public.inventory_movements (movement_type);
create index inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id);
create index inventory_movements_performed_at_idx
  on public.inventory_movements (performed_at);

comment on table public.inventory_movements is
  'Append-only quantity history. Do not rely on overwriting inventory_items.quantity alone.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.batches enable row level security;
alter table public.processing_runs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

create policy batches_select_authenticated
  on public.batches for select to authenticated
  using (public.is_authenticated());

create policy batches_write_authenticated
  on public.batches for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy processing_runs_select_authenticated
  on public.processing_runs for select to authenticated
  using (public.is_authenticated());

create policy processing_runs_write_authenticated
  on public.processing_runs for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy inventory_items_select_authenticated
  on public.inventory_items for select to authenticated
  using (public.is_authenticated());

create policy inventory_items_write_authenticated
  on public.inventory_items for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy inventory_movements_select_authenticated
  on public.inventory_movements for select to authenticated
  using (public.is_authenticated());

-- Movements are historical: allow insert, not update/delete by users.
create policy inventory_movements_insert_authenticated
  on public.inventory_movements for insert to authenticated
  with check (public.is_authenticated());
