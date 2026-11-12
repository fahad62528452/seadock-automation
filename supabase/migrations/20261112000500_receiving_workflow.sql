-- Migration 005: Step 3 workflow support
-- PO status alignment, QAQC conditional result, batch numbering, receiving RPC

-- ---------------------------------------------------------------------------
-- Purchase order statuses for the receiving workflow
-- ---------------------------------------------------------------------------

alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;

alter table public.purchase_orders
  add constraint purchase_orders_status_check
  check (status in (
    'draft',
    'awaiting_verification',
    'confirmed',
    'issued',
    'partially_received',
    'received',
    'closed',
    'cancelled'
  ));

update public.purchase_orders
set status = 'issued'
where status in ('confirmed', 'awaiting_verification');

-- ---------------------------------------------------------------------------
-- Incoming QAQC: support Conditional result
-- ---------------------------------------------------------------------------

alter table public.incoming_qaqc
  drop constraint if exists incoming_qaqc_result_check;

alter table public.incoming_qaqc
  add constraint incoming_qaqc_result_check
  check (result is null or result in ('passed', 'failed', 'conditional', 'on_hold'));

alter table public.processing_qaqc
  drop constraint if exists processing_qaqc_result_check;

alter table public.processing_qaqc
  add constraint processing_qaqc_result_check
  check (result is null or result in ('passed', 'failed', 'conditional', 'on_hold'));

alter table public.final_qaqc
  drop constraint if exists final_qaqc_result_check;

alter table public.final_qaqc
  add constraint final_qaqc_result_check
  check (result is null or result in ('passed', 'failed', 'conditional', 'on_hold'));

-- ---------------------------------------------------------------------------
-- Goods receipt lifecycle statuses
-- ---------------------------------------------------------------------------

alter table public.goods_receipts
  drop constraint if exists goods_receipts_status_check;

alter table public.goods_receipts
  add constraint goods_receipts_status_check
  check (status in (
    'draft',
    'pending_qaqc',
    'accepted',
    'rejected',
    'received',
    'cancelled'
  ));

-- ---------------------------------------------------------------------------
-- Batch number sequence (human-readable BATCH-YYYY-#####)
-- ---------------------------------------------------------------------------

create table public.batch_number_counters (
  year integer primary key,
  last_value integer not null default 0 check (last_value >= 0)
);

alter table public.batch_number_counters enable row level security;

create or replace function public.next_batch_number()
returns text
language plpgsql
as $$
declare
  current_year integer := extract(year from timezone('utc', now()))::integer;
  next_value integer;
begin
  insert into public.batch_number_counters as counters (year, last_value)
  values (current_year, 1)
  on conflict (year)
  do update set last_value = counters.last_value + 1
  returning last_value into next_value;

  return 'BATCH-' || current_year::text || '-' || lpad(next_value::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Previously received helper
-- ---------------------------------------------------------------------------

create or replace function public.po_item_received_quantity(p_item_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(gri.received_quantity), 0)
  from public.goods_receipt_items gri
  join public.goods_receipts gr on gr.id = gri.goods_receipt_id
  where gri.purchase_order_item_id = p_item_id
    and gr.status in ('accepted', 'received', 'pending_qaqc');
$$;

-- ---------------------------------------------------------------------------
-- Atomic receiving → QAQC → batch → inventory workflow
-- ---------------------------------------------------------------------------

create or replace function public.complete_receiving_workflow(
  p_purchase_order_id uuid,
  p_receipt_number text,
  p_received_at timestamptz,
  p_driver_name text,
  p_vehicle_number text,
  p_notes text,
  p_received_by uuid,
  p_actor_name text,
  p_items jsonb,
  p_qaqc_inspection_date date,
  p_qaqc_inspector_id uuid,
  p_qaqc_result text,
  p_qaqc_notes text,
  p_allow_over_receive boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_receipt public.goods_receipts%rowtype;
  v_item jsonb;
  v_po_item public.purchase_order_items%rowtype;
  v_prev_received numeric(14, 3);
  v_receiving_now numeric(14, 3);
  v_remaining numeric(14, 3);
  v_batch public.batches%rowtype;
  v_inventory public.inventory_items%rowtype;
  v_qaqc public.incoming_qaqc%rowtype;
  v_batch_ids uuid[] := '{}';
  v_inventory_ids uuid[] := '{}';
  v_total_ordered numeric(14, 3);
  v_total_received numeric(14, 3);
  v_receipt_status text;
  v_accept boolean;
begin
  if p_receipt_number is null or btrim(p_receipt_number) = '' then
    raise exception 'Receipt number is required.';
  end if;
  if p_driver_name is null or btrim(p_driver_name) = '' then
    raise exception 'Driver name is required.';
  end if;
  if p_vehicle_number is null or btrim(p_vehicle_number) = '' then
    raise exception 'Vehicle number is required.';
  end if;
  if p_qaqc_result is null or p_qaqc_result not in ('passed', 'failed', 'conditional') then
    raise exception 'Incoming QAQC result must be passed, failed, or conditional.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one receiving line is required.';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order not found.';
  end if;

  if v_po.status in ('draft', 'cancelled', 'closed') then
    raise exception 'Purchase order is not open for receiving.';
  end if;

  v_accept := p_qaqc_result in ('passed', 'conditional');
  v_receipt_status := case when v_accept then 'accepted' else 'rejected' end;

  insert into public.goods_receipts (
    receipt_number,
    purchase_order_id,
    received_at,
    received_by,
    driver_name,
    vehicle_number,
    notes,
    status
  )
  values (
    btrim(p_receipt_number),
    p_purchase_order_id,
    coalesce(p_received_at, timezone('utc', now())),
    p_received_by,
    btrim(p_driver_name),
    btrim(p_vehicle_number),
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_receipt_status
  )
  returning * into v_receipt;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_receiving_now := nullif(v_item->>'received_quantity', '')::numeric;

    if v_receiving_now is null or v_receiving_now <= 0 then
      continue;
    end if;

    select * into v_po_item
    from public.purchase_order_items
    where id = (v_item->>'purchase_order_item_id')::uuid
      and purchase_order_id = p_purchase_order_id
    for update;

    if not found then
      raise exception 'Purchase order item not found for this PO.';
    end if;

    v_prev_received := public.po_item_received_quantity(v_po_item.id);
    v_remaining := v_po_item.ordered_quantity - v_prev_received;

    if v_receiving_now > v_remaining and not coalesce(p_allow_over_receive, false) then
      raise exception 'Receiving quantity for % exceeds remaining quantity.', v_po_item.product_species;
    end if;

    insert into public.goods_receipt_items (
      goods_receipt_id,
      purchase_order_item_id,
      received_quantity,
      unit,
      notes
    )
    values (
      v_receipt.id,
      v_po_item.id,
      v_receiving_now,
      coalesce(nullif(btrim(coalesce(v_item->>'unit', '')), ''), v_po_item.unit),
      nullif(btrim(coalesce(v_item->>'notes', '')), '')
    );

    if v_accept then
      insert into public.batches (
        batch_number,
        goods_receipt_id,
        goods_receipt_item_id,
        product_species,
        received_quantity,
        remaining_quantity,
        unit,
        received_at,
        status
      )
      values (
        public.next_batch_number(),
        v_receipt.id,
        (
          select gri.id
          from public.goods_receipt_items gri
          where gri.goods_receipt_id = v_receipt.id
            and gri.purchase_order_item_id = v_po_item.id
          order by gri.created_at desc
          limit 1
        ),
        v_po_item.product_species,
        v_receiving_now,
        v_receiving_now,
        coalesce(nullif(btrim(coalesce(v_item->>'unit', '')), ''), v_po_item.unit),
        v_receipt.received_at,
        'fresh'
      )
      returning * into v_batch;

      v_batch_ids := array_append(v_batch_ids, v_batch.id);

      insert into public.inventory_items (
        batch_id,
        processing_run_id,
        inventory_type,
        product_species,
        quantity,
        unit,
        status,
        storage_location
      )
      values (
        v_batch.id,
        null,
        'raw',
        v_batch.product_species,
        v_batch.received_quantity,
        v_batch.unit,
        'available',
        null
      )
      returning * into v_inventory;

      v_inventory_ids := array_append(v_inventory_ids, v_inventory.id);

      insert into public.inventory_movements (
        inventory_item_id,
        movement_type,
        quantity,
        unit,
        reference_type,
        reference_id,
        previous_quantity,
        new_quantity,
        performed_by,
        performed_at,
        notes
      )
      values (
        v_inventory.id,
        'receipt',
        v_inventory.quantity,
        v_inventory.unit,
        'goods_receipt',
        v_receipt.id,
        0,
        v_inventory.quantity,
        p_received_by,
        v_receipt.received_at,
        'Initial inventory from goods receipt'
      );

      insert into public.audit_logs (
        user_id,
        actor_name,
        action,
        entity_type,
        entity_id,
        entity_label,
        field_name,
        previous_value,
        new_value
      )
      values
        (
          p_received_by,
          coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
          'Batch Created',
          'batch',
          v_batch.id::text,
          v_batch.batch_number,
          'batch_number',
          null,
          v_batch.batch_number
        ),
        (
          p_received_by,
          coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
          'Initial Inventory Created',
          'inventory_item',
          v_inventory.id::text,
          v_batch.batch_number,
          'quantity',
          '0',
          v_inventory.quantity::text || ' ' || v_inventory.unit
        ),
        (
          p_received_by,
          coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
          'Inventory Receipt Recorded',
          'inventory_movement',
          v_inventory.id::text,
          v_batch.batch_number,
          'new_quantity',
          '0',
          v_inventory.quantity::text || ' ' || v_inventory.unit
        );
    end if;
  end loop;

  if not exists (
    select 1 from public.goods_receipt_items where goods_receipt_id = v_receipt.id
  ) then
    raise exception 'At least one receiving quantity greater than zero is required.';
  end if;

  insert into public.incoming_qaqc (
    goods_receipt_id,
    batch_id,
    inspection_date,
    inspector_id,
    status,
    result,
    notes
  )
  values (
    v_receipt.id,
    case when array_length(v_batch_ids, 1) = 1 then v_batch_ids[1] else null end,
    coalesce(p_qaqc_inspection_date, (timezone('utc', now()))::date),
    p_qaqc_inspector_id,
    'completed',
    p_qaqc_result,
    nullif(btrim(coalesce(p_qaqc_notes, '')), '')
  )
  returning * into v_qaqc;

  select coalesce(sum(ordered_quantity), 0) into v_total_ordered
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id;

  select coalesce(sum(public.po_item_received_quantity(id)), 0) into v_total_received
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id;

  update public.purchase_orders
  set status = case
    when v_total_received <= 0 then status
    when v_total_received < v_total_ordered then 'partially_received'
    else 'received'
  end,
  updated_at = timezone('utc', now())
  where id = p_purchase_order_id
  returning * into v_po;

  insert into public.audit_logs (
    user_id,
    actor_name,
    action,
    entity_type,
    entity_id,
    entity_label,
    field_name,
    previous_value,
    new_value
  )
  values
    (
      p_received_by,
      coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
      'Goods Receipt Created',
      'goods_receipt',
      v_receipt.id::text,
      v_receipt.receipt_number,
      'status',
      null,
      v_receipt.status
    ),
    (
      p_received_by,
      coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
      'Incoming QAQC Created',
      'incoming_qaqc',
      v_qaqc.id::text,
      v_receipt.receipt_number,
      'result',
      null,
      p_qaqc_result
    ),
    (
      p_received_by,
      coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
      'PO Status Changed',
      'purchase_order',
      v_po.id::text,
      v_po.po_number,
      'status',
      null,
      v_po.status
    );

  if coalesce(p_allow_over_receive, false) then
    insert into public.audit_logs (
      user_id,
      actor_name,
      action,
      entity_type,
      entity_id,
      entity_label,
      field_name,
      previous_value,
      new_value
    )
    values (
      p_received_by,
      coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System'),
      'Goods Receipt Over-Receive Override',
      'goods_receipt',
      v_receipt.id::text,
      v_receipt.receipt_number,
      'allow_over_receive',
      'false',
      'true'
    );
  end if;

  return jsonb_build_object(
    'goods_receipt_id', v_receipt.id,
    'incoming_qaqc_id', v_qaqc.id,
    'batch_ids', to_jsonb(v_batch_ids),
    'inventory_item_ids', to_jsonb(v_inventory_ids),
    'purchase_order_status', v_po.status,
    'accepted', v_accept
  );
end;
$$;

revoke all on function public.complete_receiving_workflow(
  uuid, text, timestamptz, text, text, text, uuid, text, jsonb, date, uuid, text, text, boolean
) from public;

grant execute on function public.complete_receiving_workflow(
  uuid, text, timestamptz, text, text, text, uuid, text, jsonb, date, uuid, text, text, boolean
) to authenticated;

grant execute on function public.complete_receiving_workflow(
  uuid, text, timestamptz, text, text, text, uuid, text, jsonb, date, uuid, text, text, boolean
) to service_role;
