-- Migration 009: Step 7 allocation, reservation, fulfilment, final QAQC, dispatch
-- Customer PO → Allocation → Reservation → Fulfilment → Final QAQC → Dispatch → Consumption
--
-- Stock model
--   quantity           physical stock on hand (reduced only by dispatch, processing, wastage)
--   reserved_quantity  portion of quantity promised to customer POs (not yet dispatched)
--   available          quantity - reserved_quantity
-- Lock order used by every RPC: customer PO → fulfilment → inventory items (by id) → children.

-- ---------------------------------------------------------------------------
-- inventory_items.reserved_quantity
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists reserved_quantity numeric(14, 3) not null default 0;

alter table public.inventory_items
  drop constraint if exists inventory_items_reserved_quantity_nonnegative;

alter table public.inventory_items
  add constraint inventory_items_reserved_quantity_nonnegative
  check (reserved_quantity >= 0);

alter table public.inventory_items
  drop constraint if exists inventory_items_reserved_lte_quantity;

alter table public.inventory_items
  add constraint inventory_items_reserved_lte_quantity
  check (reserved_quantity <= quantity);

comment on column public.inventory_items.reserved_quantity is
  'Quantity promised to active customer allocations. Available = quantity - reserved_quantity.';

-- ---------------------------------------------------------------------------
-- Fulfilment number sequence (FUL-YYYY-#####)
-- ---------------------------------------------------------------------------

create table public.fulfilment_number_counters (
  year integer primary key,
  last_value integer not null default 0 check (last_value >= 0)
);

alter table public.fulfilment_number_counters enable row level security;

create or replace function public.next_fulfilment_number()
returns text
language plpgsql
as $$
declare
  current_year integer := extract(year from timezone('utc', now()))::integer;
  next_value integer;
begin
  insert into public.fulfilment_number_counters as counters (year, last_value)
  values (current_year, 1)
  on conflict (year)
  do update set last_value = counters.last_value + 1
  returning last_value into next_value;

  return 'FUL-' || current_year::text || '-' || lpad(next_value::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer PO status: partially_fulfilled is first-class
-- ---------------------------------------------------------------------------

alter table public.customer_purchase_orders
  drop constraint if exists customer_purchase_orders_status_check;

alter table public.customer_purchase_orders
  add constraint customer_purchase_orders_status_check
  check (status in (
    'received',
    'under_review',
    'action_required',
    'approved',
    'partially_allocated',
    'ready_for_fulfillment',
    'partially_fulfilled',
    'fulfilled',
    'cancelled',
    -- legacy retained for safety during rollout
    'awaiting_verification',
    'verified',
    'pending_fulfilment'
  ));

-- ---------------------------------------------------------------------------
-- Inventory allocations (reservation of stock against a customer PO item)
-- ---------------------------------------------------------------------------

create table public.inventory_allocations (
  id uuid primary key default gen_random_uuid(),
  customer_purchase_order_item_id uuid not null
    references public.customer_purchase_order_items (id) on delete restrict,
  fulfilment_id uuid
    references public.fulfilments (id) on delete restrict,
  inventory_item_id uuid not null
    references public.inventory_items (id) on delete restrict,
  batch_id uuid not null
    references public.batches (id) on delete restrict,
  allocated_quantity numeric(14, 3) not null check (allocated_quantity > 0),
  fulfilled_quantity numeric(14, 3) not null default 0 check (fulfilled_quantity >= 0),
  unit text not null default 'kg',
  status text not null default 'active'
    check (status in ('active', 'released', 'fulfilled')),
  allocated_at timestamptz not null default timezone('utc', now()),
  allocated_by uuid references public.profiles (id) on delete set null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inventory_allocations_fulfilled_lte_allocated
    check (fulfilled_quantity <= allocated_quantity)
);

create index inventory_allocations_cpo_item_idx
  on public.inventory_allocations (customer_purchase_order_item_id);
create index inventory_allocations_inventory_item_idx
  on public.inventory_allocations (inventory_item_id);
create index inventory_allocations_batch_idx
  on public.inventory_allocations (batch_id);
create index inventory_allocations_fulfilment_idx
  on public.inventory_allocations (fulfilment_id);
create index inventory_allocations_status_idx
  on public.inventory_allocations (status);

create trigger inventory_allocations_set_updated_at
before update on public.inventory_allocations
for each row execute function public.set_updated_at();

comment on table public.inventory_allocations is
  'Reservation of an inventory item against a customer PO item. Preserves PO item, inventory item, batch, and fulfilment traceability.';

alter table public.inventory_allocations enable row level security;

create policy inventory_allocations_select_authenticated
  on public.inventory_allocations for select to authenticated
  using (public.is_authenticated());

create policy inventory_allocations_write_authenticated
  on public.inventory_allocations for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

-- ---------------------------------------------------------------------------
-- Extend fulfilments
-- draft = awaiting final QAQC, ready = QAQC passed or conditional
-- ---------------------------------------------------------------------------

alter table public.fulfilments
  add column if not exists planned_date date;

alter table public.fulfilments
  add column if not exists vehicle_number text;

alter table public.fulfilments
  add column if not exists driver_name text;

alter table public.fulfilments
  add column if not exists dispatched_at timestamptz;

alter table public.fulfilments
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.fulfilments
  alter column fulfilled_at drop not null;

alter table public.fulfilments
  alter column fulfilled_at drop default;

alter table public.fulfilments
  drop constraint if exists fulfilments_status_check;

alter table public.fulfilments
  add constraint fulfilments_status_check
  check (status in (
    'draft',
    'ready',
    'partially_dispatched',
    'dispatched',
    'fulfilled',
    'cancelled'
  ));

-- ---------------------------------------------------------------------------
-- Extend fulfilment_items (allocation link + dispatched quantity)
-- ---------------------------------------------------------------------------

alter table public.fulfilment_items
  add column if not exists allocation_id uuid
    references public.inventory_allocations (id) on delete restrict;

alter table public.fulfilment_items
  add column if not exists dispatched_quantity numeric(14, 3) not null default 0
    check (dispatched_quantity >= 0);

alter table public.fulfilment_items
  drop constraint if exists fulfilment_items_dispatched_lte_quantity;

alter table public.fulfilment_items
  add constraint fulfilment_items_dispatched_lte_quantity
  check (dispatched_quantity <= quantity);

create index if not exists fulfilment_items_allocation_id_idx
  on public.fulfilment_items (allocation_id);

-- ---------------------------------------------------------------------------
-- Extend final_qaqc (distinct from incoming and processing QAQC)
-- ---------------------------------------------------------------------------

alter table public.final_qaqc
  add column if not exists quantity_checked numeric(14, 3)
    check (quantity_checked is null or quantity_checked >= 0);

alter table public.final_qaqc
  drop constraint if exists final_qaqc_result_check;

alter table public.final_qaqc
  add constraint final_qaqc_result_check
  check (result is null or result in ('passed', 'failed', 'conditional', 'on_hold'));

create unique index if not exists final_qaqc_fulfilment_unique
  on public.final_qaqc (fulfilment_id)
  where fulfilment_id is not null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.inventory_status_for(
  p_status text,
  p_quantity numeric,
  p_reserved numeric
)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'archived' then p_status
    when p_quantity <= 0 then 'dispatched'
    when p_reserved >= p_quantity then 'reserved'
    else 'available'
  end;
$$;

-- Guard: a PO cannot be cancelled while it still holds active allocations.
create or replace function public.guard_customer_po_cancel_allocations()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and exists (
       select 1
       from public.inventory_allocations a
       join public.customer_purchase_order_items i
         on i.id = a.customer_purchase_order_item_id
       where i.customer_purchase_order_id = new.id
         and a.status = 'active'
     ) then
    raise exception 'Release active inventory allocations before cancelling this purchase order.';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_purchase_orders_guard_cancel_allocations
  on public.customer_purchase_orders;

create trigger customer_purchase_orders_guard_cancel_allocations
before update of status on public.customer_purchase_orders
for each row execute function public.guard_customer_po_cancel_allocations();

-- Recalculates PO status from allocations and fulfilled quantity.
-- Allocation does not mark a PO fulfilled. Only dispatched quantity does.
create or replace function public.recalc_customer_po_fulfilment_status(
  p_customer_po_id uuid,
  p_actor uuid,
  p_actor_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.customer_purchase_orders%rowtype;
  v_requested numeric(14, 3);
  v_fulfilled numeric(14, 3);
  v_open numeric(14, 3);
  v_new text;
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  select * into v_po
  from public.customer_purchase_orders
  where id = p_customer_po_id
  for update;

  if not found then
    raise exception 'Customer purchase order not found.';
  end if;

  if v_po.status not in (
    'approved', 'partially_allocated', 'ready_for_fulfillment', 'partially_fulfilled', 'fulfilled'
  ) then
    return v_po.status;
  end if;

  select
    coalesce(sum(requested_quantity), 0),
    coalesce(sum(fulfilled_quantity), 0)
  into v_requested, v_fulfilled
  from public.customer_purchase_order_items
  where customer_purchase_order_id = p_customer_po_id
    and status <> 'cancelled';

  select coalesce(sum(a.allocated_quantity - a.fulfilled_quantity), 0)
  into v_open
  from public.inventory_allocations a
  join public.customer_purchase_order_items i on i.id = a.customer_purchase_order_item_id
  where i.customer_purchase_order_id = p_customer_po_id
    and a.status = 'active';

  v_new := case
    when v_requested > 0 and v_fulfilled >= v_requested then 'fulfilled'
    when v_fulfilled > 0 then 'partially_fulfilled'
    when v_requested > 0 and (v_open + v_fulfilled) >= v_requested then 'ready_for_fulfillment'
    when v_open > 0 then 'partially_allocated'
    else 'approved'
  end;

  if v_new <> v_po.status then
    update public.customer_purchase_orders
    set status = v_new, updated_at = timezone('utc', now())
    where id = v_po.id;

    insert into public.customer_purchase_order_status_history (
      customer_po_id, from_status, to_status, changed_by, changed_by_name, reason, notes
    )
    values (
      v_po.id, v_po.status, v_new, p_actor, v_actor,
      'Allocation and fulfilment update', 'Status recalculated from allocations and fulfilled quantity'
    );

    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value, metadata
    )
    values (
      p_actor, v_actor, 'Customer PO Status Changed', 'customer_purchase_order',
      v_po.id::text, v_po.po_number, 'status', v_po.status, v_new,
      jsonb_build_object('customer_po_id', v_po.id)
    );
  end if;

  return v_new;
end;
$$;

revoke all on function public.recalc_customer_po_fulfilment_status(uuid, uuid, text) from public;
grant execute on function public.recalc_customer_po_fulfilment_status(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 1. Allocate inventory to a customer PO item (reservation)
-- ---------------------------------------------------------------------------

create or replace function public.allocate_inventory_to_customer_po(
  p_customer_po_item_id uuid,
  p_lines jsonb,
  p_allocated_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.customer_purchase_order_items%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_inv public.inventory_items%rowtype;
  v_alloc public.inventory_allocations%rowtype;
  v_line jsonb;
  v_row record;
  v_qty numeric(14, 3);
  v_total numeric(14, 3) := 0;
  v_open numeric(14, 3);
  v_unallocated numeric(14, 3);
  v_available numeric(14, 3);
  v_alloc_ids uuid[] := '{}';
  v_po_status text;
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one inventory allocation line is required.';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if nullif(btrim(coalesce(v_line->>'inventory_item_id', '')), '') is null then
      raise exception 'Inventory item is required for each allocation line.';
    end if;
    v_qty := round(coalesce((v_line->>'quantity')::numeric, 0), 3);
    if v_qty <= 0 then
      raise exception 'Allocation quantity must be greater than zero.';
    end if;
  end loop;

  select * into v_item
  from public.customer_purchase_order_items
  where id = p_customer_po_item_id;

  if not found then
    raise exception 'Customer PO item not found.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = v_item.customer_purchase_order_id
  for update;

  select * into v_item
  from public.customer_purchase_order_items
  where id = p_customer_po_item_id
  for update;

  if v_po.status not in ('approved', 'partially_allocated', 'ready_for_fulfillment', 'partially_fulfilled') then
    raise exception 'Customer PO must be approved before inventory can be allocated.';
  end if;

  if v_item.status = 'cancelled' then
    raise exception 'This PO item is cancelled.';
  end if;

  select coalesce(sum(allocated_quantity - fulfilled_quantity), 0)
  into v_open
  from public.inventory_allocations
  where customer_purchase_order_item_id = v_item.id
    and status = 'active';

  v_unallocated := round(v_item.requested_quantity - v_item.fulfilled_quantity - v_open, 3);

  select coalesce(sum(qty), 0)
  into v_total
  from (
    select round(sum((e.value->>'quantity')::numeric), 3) as qty
    from jsonb_array_elements(p_lines) e
    group by e.value->>'inventory_item_id'
  ) totals;

  if v_total > v_unallocated then
    raise exception 'Allocation of % % exceeds the unallocated PO quantity of % %.',
      v_total, v_item.unit, greatest(v_unallocated, 0), v_item.unit;
  end if;

  for v_row in
    select
      (e.value->>'inventory_item_id')::uuid as inventory_item_id,
      round(sum((e.value->>'quantity')::numeric), 3) as qty
    from jsonb_array_elements(p_lines) e
    group by (e.value->>'inventory_item_id')::uuid
    order by (e.value->>'inventory_item_id')::uuid
  loop
    select * into v_inv
    from public.inventory_items
    where id = v_row.inventory_item_id
    for update;

    if not found then
      raise exception 'Inventory item not found.';
    end if;

    if v_inv.inventory_type = 'wastage' then
      raise exception 'Wastage inventory cannot be allocated to a customer purchase order.';
    end if;

    if v_inv.inventory_type not in ('processed', 'frozen') then
      raise exception 'Only processed or frozen inventory can be allocated to a customer purchase order.';
    end if;

    if v_inv.status not in ('available', 'reserved') then
      raise exception 'Inventory item is not available for allocation.';
    end if;

    if lower(btrim(v_inv.product_species)) not in (
      lower(btrim(v_item.product_species)),
      lower(btrim(coalesce(v_item.product_name, v_item.product_species)))
    ) then
      raise exception 'Inventory product % does not match the PO item product %.',
        v_inv.product_species, coalesce(v_item.product_name, v_item.product_species);
    end if;

    if v_inv.unit <> v_item.unit then
      raise exception 'Inventory unit % does not match the PO item unit %.', v_inv.unit, v_item.unit;
    end if;

    v_available := round(v_inv.quantity - v_inv.reserved_quantity, 3);

    if v_row.qty > v_available then
      raise exception 'Cannot allocate % % from this inventory item: only % % available.',
        v_row.qty, v_inv.unit, v_available, v_inv.unit;
    end if;

    insert into public.inventory_allocations (
      customer_purchase_order_item_id, inventory_item_id, batch_id,
      allocated_quantity, unit, status, allocated_by
    )
    values (
      v_item.id, v_inv.id, v_inv.batch_id,
      v_row.qty, v_inv.unit, 'active', p_allocated_by
    )
    returning * into v_alloc;

    v_alloc_ids := array_append(v_alloc_ids, v_alloc.id);

    update public.inventory_items
    set
      reserved_quantity = round(reserved_quantity + v_row.qty, 3),
      status = public.inventory_status_for(status, quantity, round(reserved_quantity + v_row.qty, 3)),
      updated_at = timezone('utc', now())
    where id = v_inv.id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
      previous_quantity, new_quantity, performed_by, notes
    )
    values (
      v_inv.id, 'reservation', v_row.qty, v_inv.unit, 'inventory_allocation', v_alloc.id,
      v_inv.quantity, v_inv.quantity, p_allocated_by,
      'Reserved ' || v_row.qty::text || ' ' || v_inv.unit || ' for ' || v_po.po_number
        || '. Stock quantity unchanged.'
    );

    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
      previous_value, new_value, metadata
    )
    values (
      p_allocated_by, v_actor, 'Inventory Allocated', 'inventory_allocation', v_alloc.id::text,
      v_po.po_number, 'allocated_quantity', null, v_row.qty::text || ' ' || v_inv.unit,
      jsonb_build_object(
        'customer_po_id', v_po.id,
        'customer_po_item_id', v_item.id,
        'inventory_item_id', v_inv.id,
        'batch_id', v_inv.batch_id
      )
    );
  end loop;

  v_po_status := public.recalc_customer_po_fulfilment_status(v_po.id, p_allocated_by, v_actor);

  return jsonb_build_object(
    'allocation_ids', to_jsonb(v_alloc_ids),
    'allocated_quantity', v_total,
    'unallocated_quantity', greatest(round(v_unallocated - v_total, 3), 0),
    'customer_po_status', v_po_status
  );
end;
$$;

revoke all on function public.allocate_inventory_to_customer_po(uuid, jsonb, uuid, text) from public;
grant execute on function public.allocate_inventory_to_customer_po(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.allocate_inventory_to_customer_po(uuid, jsonb, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Release an active allocation
-- ---------------------------------------------------------------------------

create or replace function public.release_inventory_allocation(
  p_allocation_id uuid,
  p_reason text,
  p_released_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc public.inventory_allocations%rowtype;
  v_item public.customer_purchase_order_items%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_inv public.inventory_items%rowtype;
  v_fulfilment public.fulfilments%rowtype;
  v_po_status text;
  v_actor text;
  v_reason text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'A release reason is required.';
  end if;

  select * into v_alloc from public.inventory_allocations where id = p_allocation_id;
  if not found then
    raise exception 'Allocation not found.';
  end if;

  select * into v_item
  from public.customer_purchase_order_items
  where id = v_alloc.customer_purchase_order_item_id;

  select * into v_po
  from public.customer_purchase_orders
  where id = v_item.customer_purchase_order_id
  for update;

  select * into v_inv
  from public.inventory_items
  where id = v_alloc.inventory_item_id
  for update;

  select * into v_alloc
  from public.inventory_allocations
  where id = p_allocation_id
  for update;

  if v_alloc.status <> 'active' then
    raise exception 'Only active allocations can be released.';
  end if;

  if v_alloc.fulfilled_quantity > 0 then
    raise exception 'Dispatched allocations cannot be released.';
  end if;

  if v_alloc.fulfilment_id is not null then
    select * into v_fulfilment from public.fulfilments where id = v_alloc.fulfilment_id;
    if found and v_fulfilment.status <> 'cancelled' then
      raise exception 'Allocation is attached to fulfilment %. Cancel the fulfilment before releasing it.',
        v_fulfilment.fulfilment_number;
    end if;
  end if;

  if v_inv.reserved_quantity < v_alloc.allocated_quantity then
    raise exception 'Reserved quantity is inconsistent for this inventory item.';
  end if;

  update public.inventory_items
  set
    reserved_quantity = round(reserved_quantity - v_alloc.allocated_quantity, 3),
    status = public.inventory_status_for(
      status, quantity, round(reserved_quantity - v_alloc.allocated_quantity, 3)
    ),
    updated_at = timezone('utc', now())
  where id = v_inv.id;

  update public.inventory_allocations
  set
    status = 'released',
    released_at = timezone('utc', now()),
    release_reason = v_reason
  where id = v_alloc.id;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
    previous_quantity, new_quantity, performed_by, notes
  )
  values (
    v_inv.id, 'release', v_alloc.allocated_quantity, v_alloc.unit, 'inventory_allocation', v_alloc.id,
    v_inv.quantity, v_inv.quantity, p_released_by,
    'Released reservation for ' || v_po.po_number || '. Stock quantity unchanged. ' || v_reason
  );

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_released_by, v_actor, 'Inventory Allocation Released', 'inventory_allocation', v_alloc.id::text,
    v_po.po_number, 'status', 'active', 'released',
    jsonb_build_object(
      'customer_po_id', v_po.id,
      'customer_po_item_id', v_item.id,
      'inventory_item_id', v_inv.id,
      'batch_id', v_alloc.batch_id,
      'released_quantity', v_alloc.allocated_quantity,
      'reason', v_reason
    )
  );

  v_po_status := public.recalc_customer_po_fulfilment_status(v_po.id, p_released_by, v_actor);

  return jsonb_build_object(
    'allocation_id', v_alloc.id,
    'released_quantity', v_alloc.allocated_quantity,
    'customer_po_status', v_po_status
  );
end;
$$;

revoke all on function public.release_inventory_allocation(uuid, text, uuid, text) from public;
grant execute on function public.release_inventory_allocation(uuid, text, uuid, text) to authenticated;
grant execute on function public.release_inventory_allocation(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Create a fulfilment from active allocations (no inventory consumed)
-- ---------------------------------------------------------------------------

create or replace function public.create_fulfilment_from_allocations(
  p_customer_po_id uuid,
  p_allocation_ids uuid[],
  p_planned_date date,
  p_notes text,
  p_created_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.customer_purchase_orders%rowtype;
  v_fulfilment public.fulfilments%rowtype;
  v_alloc record;
  v_ids uuid[];
  v_count integer;
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  select array_agg(distinct x) into v_ids from unnest(coalesce(p_allocation_ids, '{}'::uuid[])) x;

  if v_ids is null or array_length(v_ids, 1) is null then
    raise exception 'Select at least one active allocation for the fulfilment.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = p_customer_po_id
  for update;

  if not found then
    raise exception 'Customer purchase order not found.';
  end if;

  if v_po.status not in ('approved', 'partially_allocated', 'ready_for_fulfillment', 'partially_fulfilled') then
    raise exception 'Customer PO is not open for fulfilment.';
  end if;

  select count(*) into v_count
  from (
    select a.id
    from public.inventory_allocations a
    join public.customer_purchase_order_items i on i.id = a.customer_purchase_order_item_id
    where a.id = any (v_ids)
      and i.customer_purchase_order_id = p_customer_po_id
    order by a.id
    for update of a
  ) locked;

  if v_count <> array_length(v_ids, 1) then
    raise exception 'One or more allocations do not belong to this customer purchase order.';
  end if;

  if exists (
    select 1 from public.inventory_allocations a
    where a.id = any (v_ids)
      and (a.status <> 'active' or a.fulfilment_id is not null or a.fulfilled_quantity > 0)
  ) then
    raise exception 'Only active, unattached allocations can be added to a fulfilment.';
  end if;

  insert into public.fulfilments (
    fulfilment_number, customer_purchase_order_id, status, planned_date, notes, created_by
  )
  values (
    public.next_fulfilment_number(), p_customer_po_id, 'draft', p_planned_date,
    nullif(btrim(coalesce(p_notes, '')), ''), p_created_by
  )
  returning * into v_fulfilment;

  for v_alloc in
    select a.* from public.inventory_allocations a where a.id = any (v_ids) order by a.id
  loop
    insert into public.fulfilment_items (
      fulfilment_id, customer_purchase_order_item_id, inventory_item_id, batch_id,
      quantity, unit, allocation_id
    )
    values (
      v_fulfilment.id, v_alloc.customer_purchase_order_item_id, v_alloc.inventory_item_id,
      v_alloc.batch_id, round(v_alloc.allocated_quantity - v_alloc.fulfilled_quantity, 3),
      v_alloc.unit, v_alloc.id
    );

    update public.inventory_allocations
    set fulfilment_id = v_fulfilment.id
    where id = v_alloc.id;
  end loop;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_created_by, v_actor, 'Fulfilment Created', 'fulfilment', v_fulfilment.id::text,
    v_fulfilment.fulfilment_number, 'status', null, 'draft',
    jsonb_build_object(
      'customer_po_id', v_po.id,
      'po_number', v_po.po_number,
      'allocation_count', array_length(v_ids, 1)
    )
  );

  return jsonb_build_object(
    'fulfilment_id', v_fulfilment.id,
    'fulfilment_number', v_fulfilment.fulfilment_number,
    'status', v_fulfilment.status,
    'item_count', array_length(v_ids, 1)
  );
end;
$$;

revoke all on function public.create_fulfilment_from_allocations(uuid, uuid[], date, text, uuid, text) from public;
grant execute on function public.create_fulfilment_from_allocations(uuid, uuid[], date, text, uuid, text) to authenticated;
grant execute on function public.create_fulfilment_from_allocations(uuid, uuid[], date, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Record final QAQC for a fulfilment
-- ---------------------------------------------------------------------------

create or replace function public.record_final_qaqc(
  p_fulfilment_id uuid,
  p_inspection_date date,
  p_inspector_id uuid,
  p_result text,
  p_quantity_checked numeric,
  p_notes text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfilment public.fulfilments%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_qaqc public.final_qaqc%rowtype;
  v_prev_result text;
  v_batch_id uuid;
  v_batch_count integer;
  v_new_status text;
  v_actor text;
  v_qty numeric(14, 3);
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  if p_result is null or p_result not in ('passed', 'conditional', 'failed') then
    raise exception 'Final QAQC result must be passed, conditional, or failed.';
  end if;

  v_qty := case when p_quantity_checked is null then null else round(p_quantity_checked, 3) end;
  if v_qty is not null and v_qty < 0 then
    raise exception 'Quantity checked cannot be negative.';
  end if;

  select * into v_fulfilment from public.fulfilments where id = p_fulfilment_id;
  if not found then
    raise exception 'Fulfilment not found.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = v_fulfilment.customer_purchase_order_id
  for update;

  select * into v_fulfilment
  from public.fulfilments
  where id = p_fulfilment_id
  for update;

  if v_fulfilment.status in ('cancelled', 'dispatched', 'fulfilled') then
    raise exception 'Final QAQC cannot be recorded for a % fulfilment.', v_fulfilment.status;
  end if;

  select count(distinct batch_id), min(batch_id::text)::uuid
  into v_batch_count, v_batch_id
  from public.fulfilment_items
  where fulfilment_id = p_fulfilment_id;

  if v_batch_count <> 1 then
    v_batch_id := null;
  end if;

  select * into v_qaqc from public.final_qaqc where fulfilment_id = p_fulfilment_id for update;

  if found then
    v_prev_result := v_qaqc.result;
    update public.final_qaqc
    set
      inspection_date = coalesce(p_inspection_date, (timezone('utc', now()))::date),
      inspector_id = p_inspector_id,
      status = 'completed',
      result = p_result,
      quantity_checked = v_qty,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      batch_id = v_batch_id
    where id = v_qaqc.id
    returning * into v_qaqc;
  else
    insert into public.final_qaqc (
      customer_purchase_order_id, fulfilment_id, batch_id, inspection_date,
      inspector_id, status, result, quantity_checked, notes
    )
    values (
      v_fulfilment.customer_purchase_order_id, p_fulfilment_id, v_batch_id,
      coalesce(p_inspection_date, (timezone('utc', now()))::date),
      p_inspector_id, 'completed', p_result, v_qty, nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning * into v_qaqc;
  end if;

  -- A failed result keeps or returns the fulfilment to draft so dispatch stays blocked.
  v_new_status := case
    when p_result in ('passed', 'conditional') and v_fulfilment.status = 'draft' then 'ready'
    when p_result = 'failed' and v_fulfilment.status = 'ready' then 'draft'
    else v_fulfilment.status
  end;

  if v_new_status <> v_fulfilment.status then
    update public.fulfilments set status = v_new_status where id = v_fulfilment.id;
  end if;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_inspector_id, v_actor, 'Final QAQC Recorded', 'final_qaqc', v_qaqc.id::text,
    v_fulfilment.fulfilment_number, 'result', v_prev_result, p_result,
    jsonb_build_object(
      'customer_po_id', v_po.id,
      'fulfilment_id', v_fulfilment.id,
      'quantity_checked', v_qty
    )
  );

  if v_new_status <> v_fulfilment.status then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
      previous_value, new_value, metadata
    )
    values (
      p_inspector_id, v_actor, 'Fulfilment Status Changed', 'fulfilment', v_fulfilment.id::text,
      v_fulfilment.fulfilment_number, 'status', v_fulfilment.status, v_new_status,
      jsonb_build_object('customer_po_id', v_po.id)
    );
  end if;

  return jsonb_build_object(
    'final_qaqc_id', v_qaqc.id,
    'result', p_result,
    'fulfilment_status', v_new_status,
    'dispatch_allowed', p_result in ('passed', 'conditional')
  );
end;
$$;

revoke all on function public.record_final_qaqc(uuid, date, uuid, text, numeric, text, text) from public;
grant execute on function public.record_final_qaqc(uuid, date, uuid, text, numeric, text, text) to authenticated;
grant execute on function public.record_final_qaqc(uuid, date, uuid, text, numeric, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Dispatch a fulfilment (consumes stock and reservation together)
-- p_dispatch_quantity_lines: array of fulfilment_item_id and quantity.
-- Null or empty dispatches the full remaining quantity of every item.
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_fulfilment(
  p_fulfilment_id uuid,
  p_dispatch_quantity_lines jsonb,
  p_vehicle_number text,
  p_driver_name text,
  p_notes text,
  p_dispatched_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfilment public.fulfilments%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_qaqc public.final_qaqc%rowtype;
  v_fi public.fulfilment_items%rowtype;
  v_alloc public.inventory_allocations%rowtype;
  v_inv public.inventory_items%rowtype;
  v_cpo_item public.customer_purchase_order_items%rowtype;
  v_batch public.batches%rowtype;
  v_row record;
  v_line jsonb;
  v_qty numeric(14, 3);
  v_total numeric(14, 3) := 0;
  v_expected integer;
  v_matched integer := 0;
  v_vehicle text;
  v_driver text;
  v_all_dispatched boolean;
  v_po_status text;
  v_new_status text;
  v_new_fulfilled numeric(14, 3);
  v_actor text;
  v_lines jsonb;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  select * into v_fulfilment from public.fulfilments where id = p_fulfilment_id;
  if not found then
    raise exception 'Fulfilment not found.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = v_fulfilment.customer_purchase_order_id
  for update;

  select * into v_fulfilment
  from public.fulfilments
  where id = p_fulfilment_id
  for update;

  if v_po.status in ('cancelled', 'fulfilled') then
    raise exception 'Customer PO is % and cannot be dispatched.', v_po.status;
  end if;

  if v_fulfilment.status = 'draft' then
    raise exception 'Final QAQC must be passed or conditional before dispatch.';
  end if;

  if v_fulfilment.status not in ('ready', 'partially_dispatched') then
    raise exception 'Fulfilment is % and cannot be dispatched.', v_fulfilment.status;
  end if;

  select * into v_qaqc from public.final_qaqc where fulfilment_id = p_fulfilment_id;
  if not found or v_qaqc.result is null or v_qaqc.result not in ('passed', 'conditional') then
    raise exception 'Final QAQC must be passed or conditional before dispatch.';
  end if;

  v_vehicle := coalesce(nullif(btrim(coalesce(p_vehicle_number, '')), ''), v_fulfilment.vehicle_number);
  v_driver := coalesce(nullif(btrim(coalesce(p_driver_name, '')), ''), v_fulfilment.driver_name);

  if v_vehicle is null then
    raise exception 'Vehicle number is required for dispatch.';
  end if;

  if v_driver is null then
    raise exception 'Driver name is required for dispatch.';
  end if;

  if p_dispatch_quantity_lines is null
     or jsonb_typeof(p_dispatch_quantity_lines) <> 'array'
     or jsonb_array_length(p_dispatch_quantity_lines) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'fulfilment_item_id', fi.id,
      'quantity', round(fi.quantity - fi.dispatched_quantity, 3)
    )), '[]'::jsonb)
    into v_lines
    from public.fulfilment_items fi
    where fi.fulfilment_id = p_fulfilment_id
      and fi.quantity - fi.dispatched_quantity > 0;
  else
    v_lines := p_dispatch_quantity_lines;
  end if;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Nothing remains to dispatch for this fulfilment.';
  end if;

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if nullif(btrim(coalesce(v_line->>'fulfilment_item_id', '')), '') is null then
      raise exception 'Fulfilment item is required for each dispatch line.';
    end if;
    v_qty := round(coalesce((v_line->>'quantity')::numeric, 0), 3);
    if v_qty <= 0 then
      raise exception 'Dispatch quantity must be greater than zero.';
    end if;
  end loop;

  select count(distinct (e.value->>'fulfilment_item_id')) into v_expected
  from jsonb_array_elements(v_lines) e;

  for v_row in
    select
      fi.id as fulfilment_item_id,
      fi.inventory_item_id,
      l.qty
    from (
      select
        (e.value->>'fulfilment_item_id')::uuid as id,
        round(sum((e.value->>'quantity')::numeric), 3) as qty
      from jsonb_array_elements(v_lines) e
      group by (e.value->>'fulfilment_item_id')::uuid
    ) l
    join public.fulfilment_items fi
      on fi.id = l.id and fi.fulfilment_id = p_fulfilment_id
    order by fi.inventory_item_id, fi.id
  loop
    v_matched := v_matched + 1;

    select * into v_inv
    from public.inventory_items
    where id = v_row.inventory_item_id
    for update;

    select * into v_fi
    from public.fulfilment_items
    where id = v_row.fulfilment_item_id
    for update;

    select * into v_alloc
    from public.inventory_allocations
    where id = v_fi.allocation_id
    for update;

    if not found or v_alloc.status <> 'active' then
      raise exception 'Allocation for this fulfilment item is no longer active.';
    end if;

    if v_row.qty > round(v_fi.quantity - v_fi.dispatched_quantity, 3) then
      raise exception 'Dispatch quantity % % exceeds the remaining fulfilment quantity of % %.',
        v_row.qty, v_fi.unit, round(v_fi.quantity - v_fi.dispatched_quantity, 3), v_fi.unit;
    end if;

    if v_inv.reserved_quantity < v_row.qty or v_inv.quantity < v_row.qty then
      raise exception 'Reserved stock is insufficient to dispatch % % from this inventory item.',
        v_row.qty, v_inv.unit;
    end if;

    select * into v_cpo_item
    from public.customer_purchase_order_items
    where id = v_fi.customer_purchase_order_item_id
    for update;

    v_new_fulfilled := round(v_cpo_item.fulfilled_quantity + v_row.qty, 3);
    if v_new_fulfilled > v_cpo_item.requested_quantity then
      raise exception 'Dispatch quantity exceeds the remaining requested quantity for this PO item.';
    end if;

    update public.inventory_items
    set
      quantity = round(quantity - v_row.qty, 3),
      reserved_quantity = round(reserved_quantity - v_row.qty, 3),
      status = public.inventory_status_for(
        status, round(quantity - v_row.qty, 3), round(reserved_quantity - v_row.qty, 3)
      ),
      updated_at = timezone('utc', now())
    where id = v_inv.id;

    update public.inventory_allocations
    set
      fulfilled_quantity = round(fulfilled_quantity + v_row.qty, 3),
      status = case
        when round(fulfilled_quantity + v_row.qty, 3) >= allocated_quantity then 'fulfilled'
        else 'active'
      end
    where id = v_alloc.id;

    update public.fulfilment_items
    set dispatched_quantity = round(dispatched_quantity + v_row.qty, 3)
    where id = v_fi.id;

    update public.customer_purchase_order_items
    set
      fulfilled_quantity = v_new_fulfilled,
      status = case
        when v_new_fulfilled >= requested_quantity then 'fulfilled'
        else 'partially_fulfilled'
      end
    where id = v_cpo_item.id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
      previous_quantity, new_quantity, performed_by, notes
    )
    values (
      v_inv.id, 'dispatch', -v_row.qty, v_inv.unit, 'fulfilment', v_fulfilment.id,
      v_inv.quantity, round(v_inv.quantity - v_row.qty, 3), p_dispatched_by,
      'Dispatched on ' || v_fulfilment.fulfilment_number || ' for ' || v_po.po_number
    );

    select * into v_batch from public.batches where id = v_inv.batch_id;

    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
      previous_value, new_value, metadata
    )
    values (
      p_dispatched_by, v_actor, 'Inventory Dispatched', 'inventory_item', v_inv.id::text,
      v_batch.batch_number, 'quantity', v_inv.quantity::text, round(v_inv.quantity - v_row.qty, 3)::text,
      jsonb_build_object(
        'customer_po_id', v_po.id,
        'fulfilment_id', v_fulfilment.id,
        'allocation_id', v_alloc.id,
        'batch_id', v_inv.batch_id,
        'dispatched_quantity', v_row.qty
      )
    );

    v_total := v_total + v_row.qty;
  end loop;

  if v_matched <> v_expected then
    raise exception 'One or more dispatch lines do not belong to this fulfilment.';
  end if;

  v_po_status := public.recalc_customer_po_fulfilment_status(v_po.id, p_dispatched_by, v_actor);

  select bool_and(dispatched_quantity >= quantity)
  into v_all_dispatched
  from public.fulfilment_items
  where fulfilment_id = p_fulfilment_id;

  v_new_status := case
    when coalesce(v_all_dispatched, false) and v_po_status = 'fulfilled' then 'fulfilled'
    when coalesce(v_all_dispatched, false) then 'dispatched'
    else 'partially_dispatched'
  end;

  update public.fulfilments
  set
    status = v_new_status,
    vehicle_number = v_vehicle,
    driver_name = v_driver,
    dispatched_at = coalesce(dispatched_at, timezone('utc', now())),
    fulfilled_at = case
      when v_new_status in ('dispatched', 'fulfilled') then timezone('utc', now())
      else fulfilled_at
    end,
    fulfilled_by = case
      when v_new_status in ('dispatched', 'fulfilled') then p_dispatched_by
      else fulfilled_by
    end,
    notes = case
      when nullif(btrim(coalesce(p_notes, '')), '') is null then notes
      when notes is null then btrim(p_notes)
      else notes || E'\n' || btrim(p_notes)
    end
  where id = v_fulfilment.id;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_dispatched_by, v_actor, 'Fulfilment Dispatched', 'fulfilment', v_fulfilment.id::text,
    v_fulfilment.fulfilment_number, 'status', v_fulfilment.status, v_new_status,
    jsonb_build_object(
      'customer_po_id', v_po.id,
      'dispatched_quantity', v_total,
      'vehicle_number', v_vehicle,
      'driver_name', v_driver
    )
  );

  return jsonb_build_object(
    'fulfilment_id', v_fulfilment.id,
    'fulfilment_status', v_new_status,
    'dispatched_quantity', v_total,
    'customer_po_status', v_po_status
  );
end;
$$;

revoke all on function public.dispatch_fulfilment(uuid, jsonb, text, text, text, uuid, text) from public;
grant execute on function public.dispatch_fulfilment(uuid, jsonb, text, text, text, uuid, text) to authenticated;
grant execute on function public.dispatch_fulfilment(uuid, jsonb, text, text, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Cancel a customer PO and release every active allocation
-- ---------------------------------------------------------------------------

create or replace function public.cancel_customer_po_release_allocations(
  p_customer_po_id uuid,
  p_reason text,
  p_cancelled_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.customer_purchase_orders%rowtype;
  v_inv public.inventory_items%rowtype;
  v_alloc record;
  v_released integer := 0;
  v_released_qty numeric(14, 3) := 0;
  v_fulfilled numeric(14, 3);
  v_from text;
  v_reason text;
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'A cancellation reason is required.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = p_customer_po_id
  for update;

  if not found then
    raise exception 'Customer purchase order not found.';
  end if;

  if v_po.status in ('cancelled', 'fulfilled') then
    raise exception 'Customer PO is already %.', v_po.status;
  end if;

  select coalesce(sum(fulfilled_quantity), 0) into v_fulfilled
  from public.customer_purchase_order_items
  where customer_purchase_order_id = p_customer_po_id;

  if v_fulfilled > 0 then
    raise exception 'A purchase order with dispatched quantity cannot be cancelled.';
  end if;

  v_from := v_po.status;

  for v_alloc in
    select a.id, a.inventory_item_id, a.allocated_quantity, a.unit, a.batch_id,
           a.customer_purchase_order_item_id
    from public.inventory_allocations a
    join public.customer_purchase_order_items i on i.id = a.customer_purchase_order_item_id
    where i.customer_purchase_order_id = p_customer_po_id
      and a.status = 'active'
    order by a.inventory_item_id, a.id
  loop
    select * into v_inv
    from public.inventory_items
    where id = v_alloc.inventory_item_id
    for update;

    update public.inventory_items
    set
      reserved_quantity = round(greatest(reserved_quantity - v_alloc.allocated_quantity, 0), 3),
      status = public.inventory_status_for(
        status, quantity, round(greatest(reserved_quantity - v_alloc.allocated_quantity, 0), 3)
      ),
      updated_at = timezone('utc', now())
    where id = v_inv.id;

    update public.inventory_allocations
    set
      status = 'released',
      released_at = timezone('utc', now()),
      release_reason = 'PO cancelled: ' || v_reason
    where id = v_alloc.id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
      previous_quantity, new_quantity, performed_by, notes
    )
    values (
      v_inv.id, 'release', v_alloc.allocated_quantity, v_alloc.unit, 'inventory_allocation', v_alloc.id,
      v_inv.quantity, v_inv.quantity, p_cancelled_by,
      'Released reservation because ' || v_po.po_number || ' was cancelled. Stock quantity unchanged.'
    );

    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
      previous_value, new_value, metadata
    )
    values (
      p_cancelled_by, v_actor, 'Inventory Allocation Released', 'inventory_allocation', v_alloc.id::text,
      v_po.po_number, 'status', 'active', 'released',
      jsonb_build_object(
        'customer_po_id', v_po.id,
        'inventory_item_id', v_inv.id,
        'batch_id', v_alloc.batch_id,
        'released_quantity', v_alloc.allocated_quantity,
        'reason', v_reason
      )
    );

    v_released := v_released + 1;
    v_released_qty := v_released_qty + v_alloc.allocated_quantity;
  end loop;

  update public.fulfilments
  set status = 'cancelled'
  where customer_purchase_order_id = p_customer_po_id
    and status in ('draft', 'ready');

  update public.final_qaqc
  set status = 'cancelled'
  where customer_purchase_order_id = p_customer_po_id
    and status <> 'cancelled';

  update public.customer_purchase_order_items
  set status = 'cancelled'
  where customer_purchase_order_id = p_customer_po_id;

  update public.customer_purchase_orders
  set
    status = 'cancelled',
    action_required = false,
    action_required_reason = null,
    action_required_at = null,
    action_required_by = null,
    updated_at = timezone('utc', now())
  where id = v_po.id;

  insert into public.customer_purchase_order_status_history (
    customer_po_id, from_status, to_status, changed_by, changed_by_name, reason, notes
  )
  values (
    v_po.id, v_from, 'cancelled', p_cancelled_by, v_actor, v_reason,
    'Released ' || v_released::text || ' allocation(s)'
  );

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_cancelled_by, v_actor, 'Customer PO Cancelled', 'customer_purchase_order', v_po.id::text,
    v_po.po_number, 'status', v_from, 'cancelled',
    jsonb_build_object(
      'customer_po_id', v_po.id,
      'reason', v_reason,
      'released_allocations', v_released,
      'released_quantity', v_released_qty
    )
  );

  return jsonb_build_object(
    'customer_purchase_order_id', v_po.id,
    'released_allocations', v_released,
    'released_quantity', v_released_qty,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.cancel_customer_po_release_allocations(uuid, text, uuid, text) from public;
grant execute on function public.cancel_customer_po_release_allocations(uuid, text, uuid, text) to authenticated;
grant execute on function public.cancel_customer_po_release_allocations(uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Cancel a fulfilment that has not been dispatched
-- Allocations stay reserved but are detached so they can join a new fulfilment.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_fulfilment(
  p_fulfilment_id uuid,
  p_reason text,
  p_cancelled_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfilment public.fulfilments%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_reason text;
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null then
    raise exception 'A cancellation reason is required.';
  end if;

  select * into v_fulfilment from public.fulfilments where id = p_fulfilment_id;
  if not found then
    raise exception 'Fulfilment not found.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = v_fulfilment.customer_purchase_order_id
  for update;

  select * into v_fulfilment
  from public.fulfilments
  where id = p_fulfilment_id
  for update;

  if v_fulfilment.status not in ('draft', 'ready') then
    raise exception 'Only draft or ready fulfilments can be cancelled.';
  end if;

  update public.inventory_allocations
  set fulfilment_id = null
  where fulfilment_id = p_fulfilment_id
    and status = 'active';

  update public.final_qaqc
  set status = 'cancelled'
  where fulfilment_id = p_fulfilment_id;

  update public.fulfilments
  set status = 'cancelled'
  where id = p_fulfilment_id;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name,
    previous_value, new_value, metadata
  )
  values (
    p_cancelled_by, v_actor, 'Fulfilment Cancelled', 'fulfilment', v_fulfilment.id::text,
    v_fulfilment.fulfilment_number, 'status', v_fulfilment.status, 'cancelled',
    jsonb_build_object('customer_po_id', v_po.id, 'reason', v_reason)
  );

  return jsonb_build_object(
    'fulfilment_id', v_fulfilment.id,
    'status', 'cancelled'
  );
end;
$$;

revoke all on function public.cancel_fulfilment(uuid, text, uuid, text) from public;
grant execute on function public.cancel_fulfilment(uuid, text, uuid, text) to authenticated;
grant execute on function public.cancel_fulfilment(uuid, text, uuid, text) to service_role;
