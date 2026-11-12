-- Migration 006: Step 4 processing workflow
-- Run numbering, status/movement alignment, complete_processing_workflow RPC

-- ---------------------------------------------------------------------------
-- Processing run statuses: Draft / In Progress / Completed / Cancelled
-- ---------------------------------------------------------------------------

alter table public.processing_runs
  drop constraint if exists processing_runs_status_check;

update public.processing_runs
set status = 'draft'
where status = 'pending';

alter table public.processing_runs
  add constraint processing_runs_status_check
  check (status in ('draft', 'in_progress', 'completed', 'cancelled'));

alter table public.processing_runs
  alter column status set default 'draft';

-- Operator display name (profile FK may be null with placeholder sessions)
alter table public.processing_runs
  add column if not exists operator_name text;

-- ---------------------------------------------------------------------------
-- Inventory movement types for processing accounting
-- ---------------------------------------------------------------------------

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'receipt',
    'transfer',
    'processing_input',
    'processing_output',
    'processing_consumption',
    'processing_yield',
    'processing_wastage',
    'wastage',
    'dispatch',
    'adjustment',
    'reservation',
    'release'
  ));

-- ---------------------------------------------------------------------------
-- Processing run number sequence (RUN-YYYY-#####)
-- ---------------------------------------------------------------------------

create table public.processing_run_number_counters (
  year integer primary key,
  last_value integer not null default 0 check (last_value >= 0)
);

alter table public.processing_run_number_counters enable row level security;

create or replace function public.next_processing_run_number()
returns text
language plpgsql
as $$
declare
  current_year integer := extract(year from timezone('utc', now()))::integer;
  next_value integer;
begin
  insert into public.processing_run_number_counters as counters (year, last_value)
  values (current_year, 1)
  on conflict (year)
  do update set last_value = counters.last_value + 1
  returning last_value into next_value;

  return 'RUN-' || current_year::text || '-' || lpad(next_value::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic processing completion
-- Parent Batch → Processing Run → QAQC → Raw consumption → Yield + Wastage
-- ---------------------------------------------------------------------------

create or replace function public.complete_processing_workflow(
  p_parent_batch_id uuid,
  p_processing_date date,
  p_operator_name text,
  p_input_quantity numeric,
  p_input_unit text,
  p_yield_quantity numeric,
  p_wastage_quantity numeric,
  p_notes text,
  p_processed_by uuid,
  p_actor_name text,
  p_qaqc_inspection_date date,
  p_qaqc_inspector_id uuid,
  p_qaqc_result text,
  p_qaqc_notes text,
  p_processing_run_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.batches%rowtype;
  v_raw public.inventory_items%rowtype;
  v_run public.processing_runs%rowtype;
  v_qaqc public.processing_qaqc%rowtype;
  v_processed public.inventory_items%rowtype;
  v_wastage public.inventory_items%rowtype;
  v_processed_id uuid;
  v_wastage_id uuid;
  v_input numeric(14, 3);
  v_yield numeric(14, 3);
  v_wastage_qty numeric(14, 3);
  v_available numeric(14, 3);
  v_accept boolean;
  v_prev_raw numeric(14, 3);
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');
  v_input := round(coalesce(p_input_quantity, 0), 3);
  v_yield := round(coalesce(p_yield_quantity, 0), 3);
  v_wastage_qty := round(coalesce(p_wastage_quantity, 0), 3);

  if v_input <= 0 then
    raise exception 'Input quantity must be greater than zero.';
  end if;

  if v_yield < 0 or v_wastage_qty < 0 then
    raise exception 'Yield and wastage quantities cannot be negative.';
  end if;

  if v_input <> (v_yield + v_wastage_qty) then
    raise exception 'Input quantity must equal yield quantity plus wastage quantity.';
  end if;

  if p_qaqc_result is null or p_qaqc_result not in ('passed', 'failed', 'conditional') then
    raise exception 'A valid processing QAQC result is required.';
  end if;

  if nullif(btrim(coalesce(p_operator_name, '')), '') is null then
    raise exception 'Processing operator is required.';
  end if;

  select * into v_batch
  from public.batches
  where id = p_parent_batch_id
  for update;

  if not found then
    raise exception 'Parent batch not found.';
  end if;

  if v_batch.status in ('archived', 'dispatched') then
    raise exception 'This batch is not eligible for processing.';
  end if;

  select * into v_raw
  from public.inventory_items
  where batch_id = p_parent_batch_id
    and inventory_type = 'raw'
    and status = 'available'
  order by created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'No available raw inventory found for this batch.';
  end if;

  v_available := round(v_raw.quantity, 3);
  if v_input > v_available then
    raise exception 'Processing quantity cannot exceed available batch inventory.';
  end if;

  v_accept := p_qaqc_result in ('passed', 'conditional');

  if p_processing_run_id is not null then
    select * into v_run
    from public.processing_runs
    where id = p_processing_run_id
    for update;

    if not found then
      raise exception 'Processing run not found.';
    end if;

    if v_run.parent_batch_id <> p_parent_batch_id then
      raise exception 'Processing run does not belong to the selected batch.';
    end if;

    if v_run.status = 'completed' then
      raise exception 'Processing run is already completed.';
    end if;

    if v_run.status = 'cancelled' then
      raise exception 'Cancelled processing runs cannot be completed.';
    end if;

    update public.processing_runs
    set
      processing_date = coalesce(p_processing_date, processing_date),
      operator_name = nullif(btrim(p_operator_name), ''),
      input_quantity = v_input,
      input_unit = coalesce(nullif(btrim(coalesce(p_input_unit, '')), ''), v_raw.unit),
      processed_quantity = v_yield,
      wastage_quantity = v_wastage_qty,
      status = 'completed',
      processed_by = p_processed_by,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = timezone('utc', now())
    where id = v_run.id
    returning * into v_run;
  else
    insert into public.processing_runs (
      processing_run_number,
      parent_batch_id,
      processing_date,
      input_quantity,
      input_unit,
      processed_quantity,
      wastage_quantity,
      status,
      processed_by,
      operator_name,
      notes
    )
    values (
      public.next_processing_run_number(),
      p_parent_batch_id,
      coalesce(p_processing_date, (timezone('utc', now()))::date),
      v_input,
      coalesce(nullif(btrim(coalesce(p_input_unit, '')), ''), v_raw.unit),
      v_yield,
      v_wastage_qty,
      'completed',
      p_processed_by,
      nullif(btrim(p_operator_name), ''),
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    returning * into v_run;
  end if;

  insert into public.processing_qaqc (
    processing_run_id,
    batch_id,
    inspection_date,
    inspector_id,
    status,
    result,
    notes
  )
  values (
    v_run.id,
    p_parent_batch_id,
    coalesce(p_qaqc_inspection_date, (timezone('utc', now()))::date),
    p_qaqc_inspector_id,
    'completed',
    p_qaqc_result,
    nullif(btrim(coalesce(p_qaqc_notes, '')), '')
  )
  returning * into v_qaqc;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
  )
  values
    (
      p_processed_by, v_actor, 'Processing Run Created', 'processing_run', v_run.id::text,
      v_run.processing_run_number, 'status', null, v_run.status
    ),
    (
      p_processed_by, v_actor, 'Processing QAQC Created', 'processing_qaqc', v_qaqc.id::text,
      v_run.processing_run_number, 'result', null, p_qaqc_result
    );

  if not v_accept then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_processed_by, v_actor, 'Processing Run Completed', 'processing_run', v_run.id::text,
      v_run.processing_run_number, 'inventory_accepted', 'pending', 'false'
    );

    return jsonb_build_object(
      'processing_run_id', v_run.id,
      'processing_run_number', v_run.processing_run_number,
      'processing_qaqc_id', v_qaqc.id,
      'accepted', false,
      'raw_inventory_item_id', v_raw.id,
      'processed_inventory_item_id', null,
      'wastage_inventory_item_id', null
    );
  end if;

  -- Accepted: consume raw and create processed + wastage inventory
  v_prev_raw := v_raw.quantity;

  update public.inventory_items
  set
    quantity = round(quantity - v_input, 3),
    updated_at = timezone('utc', now())
  where id = v_raw.id
  returning * into v_raw;

  if round(v_raw.quantity, 3) < 0 then
    raise exception 'Processing quantity cannot exceed available batch inventory.';
  end if;

  insert into public.inventory_movements (
    inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
    previous_quantity, new_quantity, performed_by, notes
  )
  values (
    v_raw.id, 'processing_consumption', -v_input, v_run.input_unit, 'processing_run', v_run.id,
    v_prev_raw, v_raw.quantity, p_processed_by, 'Raw inventory consumed by processing'
  );

  if v_yield > 0 then
    insert into public.inventory_items (
      batch_id, processing_run_id, inventory_type, product_species, quantity, unit, status
    )
    values (
      p_parent_batch_id, v_run.id, 'processed', v_batch.product_species, v_yield, v_run.input_unit, 'available'
    )
    returning * into v_processed;

    v_processed_id := v_processed.id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
      previous_quantity, new_quantity, performed_by, notes
    )
    values (
      v_processed.id, 'processing_yield', v_yield, v_run.input_unit, 'processing_run', v_run.id,
      0, v_yield, p_processed_by, 'Processed yield from processing run'
    );
  end if;

  if v_wastage_qty > 0 then
    insert into public.inventory_items (
      batch_id, processing_run_id, inventory_type, product_species, quantity, unit, status
    )
    values (
      p_parent_batch_id, v_run.id, 'wastage', v_batch.product_species, v_wastage_qty, v_run.input_unit, 'available'
    )
    returning * into v_wastage;

    v_wastage_id := v_wastage.id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit, reference_type, reference_id,
      previous_quantity, new_quantity, performed_by, notes
    )
    values (
      v_wastage.id, 'processing_wastage', v_wastage_qty, v_run.input_unit, 'processing_run', v_run.id,
      0, v_wastage_qty, p_processed_by, 'Wastage inventory from processing run'
    );
  end if;

  update public.batches
  set
    remaining_quantity = round(greatest(remaining_quantity - v_input, 0), 3),
    status = case
      when round(greatest(remaining_quantity - v_input, 0), 3) = 0 then 'processed'
      else 'in_processing'
    end,
    updated_at = timezone('utc', now())
  where id = p_parent_batch_id;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
  )
  values (
    p_processed_by, v_actor, 'Processing Run Completed', 'processing_run', v_run.id::text,
    v_run.processing_run_number, 'status', 'in_progress', 'completed'
  ),
  (
    p_processed_by, v_actor, 'Raw Inventory Consumed', 'inventory_item', v_raw.id::text,
    v_batch.batch_number, 'quantity', v_prev_raw::text, v_raw.quantity::text
  );

  if v_processed_id is not null then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_processed_by, v_actor, 'Processed Inventory Created', 'inventory_item', v_processed_id::text,
      v_batch.batch_number, 'quantity', '0', v_yield::text || ' ' || v_run.input_unit
    );
  end if;

  if v_wastage_id is not null then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_processed_by, v_actor, 'Wastage Inventory Created', 'inventory_item', v_wastage_id::text,
      v_batch.batch_number, 'quantity', '0', v_wastage_qty::text || ' ' || v_run.input_unit
    );
  end if;

  return jsonb_build_object(
    'processing_run_id', v_run.id,
    'processing_run_number', v_run.processing_run_number,
    'processing_qaqc_id', v_qaqc.id,
    'accepted', true,
    'raw_inventory_item_id', v_raw.id,
    'processed_inventory_item_id', v_processed_id,
    'wastage_inventory_item_id', v_wastage_id
  );
end;
$$;

revoke all on function public.complete_processing_workflow(
  uuid, date, text, numeric, text, numeric, numeric, text, uuid, text, date, uuid, text, text, uuid
) from public;

grant execute on function public.complete_processing_workflow(
  uuid, date, text, numeric, text, numeric, numeric, text, uuid, text, date, uuid, text, text, uuid
) to authenticated;

grant execute on function public.complete_processing_workflow(
  uuid, date, text, numeric, text, numeric, numeric, text, uuid, text, date, uuid, text, text, uuid
) to service_role;

-- Draft create helper (no inventory impact)
create or replace function public.create_processing_run_draft(
  p_parent_batch_id uuid,
  p_processing_date date,
  p_operator_name text,
  p_input_quantity numeric,
  p_input_unit text,
  p_notes text,
  p_processed_by uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.batches%rowtype;
  v_raw public.inventory_items%rowtype;
  v_run public.processing_runs%rowtype;
  v_input numeric(14, 3);
  v_available numeric(14, 3);
  v_actor text;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');
  v_input := round(coalesce(p_input_quantity, 0), 3);

  if v_input <= 0 then
    raise exception 'Input quantity must be greater than zero.';
  end if;

  if nullif(btrim(coalesce(p_operator_name, '')), '') is null then
    raise exception 'Processing operator is required.';
  end if;

  select * into v_batch from public.batches where id = p_parent_batch_id for update;
  if not found then
    raise exception 'Parent batch not found.';
  end if;

  select * into v_raw
  from public.inventory_items
  where batch_id = p_parent_batch_id
    and inventory_type = 'raw'
    and status = 'available'
  order by created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'No available raw inventory found for this batch.';
  end if;

  v_available := round(v_raw.quantity, 3);
  if v_input > v_available then
    raise exception 'Processing quantity cannot exceed available batch inventory.';
  end if;

  insert into public.processing_runs (
    processing_run_number,
    parent_batch_id,
    processing_date,
    input_quantity,
    input_unit,
    processed_quantity,
    wastage_quantity,
    status,
    processed_by,
    operator_name,
    notes
  )
  values (
    public.next_processing_run_number(),
    p_parent_batch_id,
    coalesce(p_processing_date, (timezone('utc', now()))::date),
    v_input,
    coalesce(nullif(btrim(coalesce(p_input_unit, '')), ''), v_raw.unit),
    0,
    0,
    'draft',
    p_processed_by,
    nullif(btrim(p_operator_name), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into v_run;

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
  )
  values (
    p_processed_by, v_actor, 'Processing Run Created', 'processing_run', v_run.id::text,
    v_run.processing_run_number, 'status', null, 'draft'
  );

  return jsonb_build_object(
    'processing_run_id', v_run.id,
    'processing_run_number', v_run.processing_run_number,
    'status', v_run.status
  );
end;
$$;

revoke all on function public.create_processing_run_draft(
  uuid, date, text, numeric, text, text, uuid, text
) from public;

grant execute on function public.create_processing_run_draft(
  uuid, date, text, numeric, text, text, uuid, text
) to authenticated;

grant execute on function public.create_processing_run_draft(
  uuid, date, text, numeric, text, text, uuid, text
) to service_role;
