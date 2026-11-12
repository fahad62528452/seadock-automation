-- Migration 010: Step 8 inventory lifecycle (fresh → frozen)

-- ---------------------------------------------------------------------------
-- inventory_items.frozen_at
-- ---------------------------------------------------------------------------

alter table public.inventory_items
  add column if not exists frozen_at timestamptz;

create index if not exists inventory_items_frozen_at_idx
  on public.inventory_items (frozen_at)
  where frozen_at is not null;

comment on column public.inventory_items.frozen_at is
  'When raw or processed stock was reclassified as frozen inventory (no quantity change).';

-- ---------------------------------------------------------------------------
-- Movement type: fresh_to_frozen (lifecycle reclassification, zero delta)
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
    'release',
    'fresh_to_frozen'
  ));

alter table public.inventory_movements
  drop constraint if exists inventory_movements_quantity_check;

alter table public.inventory_movements
  add constraint inventory_movements_quantity_check
  check (quantity <> 0 or movement_type = 'fresh_to_frozen');

-- ---------------------------------------------------------------------------
-- Freeze eligible fresh stock (raw / processed past fresh window)
-- ---------------------------------------------------------------------------

create or replace function public.freeze_eligible_inventory(
  p_actor uuid,
  p_now timestamptz default timezone('utc', now())
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_inv public.inventory_items%rowtype;
  v_actor text;
  v_fresh_until timestamptz;
  v_origin timestamptz;
  v_frozen_ids uuid[] := '{}';
  v_qty numeric(14, 3);
begin
  select coalesce(nullif(btrim(full_name), ''), 'System')
  into v_actor
  from public.profiles
  where id = p_actor;

  v_actor := coalesce(v_actor, 'System');

  for v_row in
    select i.id
    from public.inventory_items i
    inner join public.batches b on b.id = i.batch_id
    where i.quantity > 0
      and i.inventory_type in ('raw', 'processed')
      and (
        case
          when i.inventory_type = 'raw' then b.received_at
          else i.created_at
        end
      ) + interval '2 days' <= p_now
    order by i.id
    for update of i
  loop
    select * into v_inv
    from public.inventory_items
    where id = v_row.id
    for update;

    if not found then
      continue;
    end if;

    if v_inv.quantity <= 0
      or v_inv.inventory_type not in ('raw', 'processed') then
      continue;
    end if;

    select
      case when v_inv.inventory_type = 'raw' then b.received_at else v_inv.created_at end,
      (
        case when v_inv.inventory_type = 'raw' then b.received_at else v_inv.created_at end
      ) + interval '2 days'
    into v_origin, v_fresh_until
    from public.batches b
    where b.id = v_inv.batch_id;

    if v_fresh_until > p_now then
      continue;
    end if;

    v_qty := round(v_inv.quantity, 3);

    update public.inventory_items
    set
      inventory_type = 'frozen',
      frozen_at = p_now,
      updated_at = timezone('utc', now())
    where id = v_inv.id;

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
      v_inv.id,
      'fresh_to_frozen',
      0,
      v_inv.unit,
      'inventory_lifecycle',
      v_inv.id,
      v_qty,
      v_qty,
      p_actor,
      p_now,
      'Reclassified from ' || v_inv.inventory_type || ' to frozen without changing on-hand quantity.'
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
      new_value,
      metadata
    )
    values (
      p_actor,
      v_actor,
      'Inventory Frozen',
      'inventory_item',
      v_inv.id::text,
      (
        select batch_number from public.batches where id = v_inv.batch_id
      ),
      'inventory_type',
      v_inv.inventory_type,
      'frozen',
      jsonb_build_object(
        'inventory_item_id', v_inv.id,
        'batch_id', v_inv.batch_id,
        'frozen_at', p_now,
        'quantity', v_qty
      )
    );

    v_frozen_ids := array_append(v_frozen_ids, v_inv.id);
  end loop;

  return jsonb_build_object(
    'frozen_count', coalesce(array_length(v_frozen_ids, 1), 0),
    'frozen_ids', to_jsonb(v_frozen_ids)
  );
end;
$$;

revoke all on function public.freeze_eligible_inventory(uuid, timestamptz) from public;
grant execute on function public.freeze_eligible_inventory(uuid, timestamptz) to authenticated;
grant execute on function public.freeze_eligible_inventory(uuid, timestamptz) to service_role;

alter table public.inventory_items enable row level security;
