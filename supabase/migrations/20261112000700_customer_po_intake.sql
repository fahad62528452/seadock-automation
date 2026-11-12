-- Migration 007: Step 5 Customer PO intake foundation
-- Customers master, PO statuses/priority/action-required, status history, email_messages boundary

-- ---------------------------------------------------------------------------
-- Customers (operational master — not a CRM)
-- ---------------------------------------------------------------------------

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null,
  name text not null,
  email text,
  phone text,
  address text,
  contact_person text,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_customer_code_unique unique (customer_code)
);

create index customers_name_idx on public.customers (name);
create index customers_status_idx on public.customers (status);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

create policy customers_select_authenticated
  on public.customers for select to authenticated
  using (public.is_authenticated());

create policy customers_write_authenticated
  on public.customers for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create table public.customer_code_counters (
  year integer primary key,
  last_value integer not null default 0 check (last_value >= 0)
);

alter table public.customer_code_counters enable row level security;

create or replace function public.next_customer_code()
returns text
language plpgsql
as $$
declare
  next_value integer;
begin
  insert into public.customer_code_counters as counters (year, last_value)
  values (0, 1)
  on conflict (year)
  do update set last_value = counters.last_value + 1
  returning last_value into next_value;

  return 'CUST-' || lpad(next_value::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Evolve customer_purchase_orders for intake workflow
-- ---------------------------------------------------------------------------

alter table public.customer_purchase_orders
  add column if not exists customer_id uuid references public.customers (id) on delete restrict;

alter table public.customer_purchase_orders
  add column if not exists priority text not null default 'normal';

alter table public.customer_purchase_orders
  add column if not exists action_required boolean not null default false;

alter table public.customer_purchase_orders
  add column if not exists action_required_reason text;

alter table public.customer_purchase_orders
  add column if not exists action_required_at timestamptz;

alter table public.customer_purchase_orders
  add column if not exists action_required_by uuid references public.profiles (id) on delete set null;

alter table public.customer_purchase_orders
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

-- Map legacy statuses before replacing the check constraint
update public.customer_purchase_orders
set status = case status
  when 'awaiting_verification' then 'received'
  when 'verified' then 'approved'
  when 'pending_fulfilment' then 'ready_for_fulfillment'
  when 'partially_fulfilled' then 'partially_allocated'
  else status
end
where status in (
  'awaiting_verification',
  'verified',
  'pending_fulfilment',
  'partially_fulfilled'
);

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
    'fulfilled',
    'cancelled',
    -- legacy retained for safety during rollout
    'awaiting_verification',
    'verified',
    'pending_fulfilment',
    'partially_fulfilled'
  ));

alter table public.customer_purchase_orders
  alter column status set default 'received';

alter table public.customer_purchase_orders
  drop constraint if exists customer_purchase_orders_priority_check;

alter table public.customer_purchase_orders
  add constraint customer_purchase_orders_priority_check
  check (priority in ('normal', 'high', 'urgent'));

alter table public.customer_purchase_orders
  drop constraint if exists customer_purchase_orders_source_check;

alter table public.customer_purchase_orders
  add constraint customer_purchase_orders_source_check
  check (source in ('manual', 'email', 'api', 'import'));

-- Duplicate protection: unique per customer + PO number
alter table public.customer_purchase_orders
  drop constraint if exists customer_purchase_orders_po_number_unique;

create unique index if not exists customer_purchase_orders_customer_po_unique
  on public.customer_purchase_orders (customer_id, po_number)
  where customer_id is not null;

create unique index if not exists customer_purchase_orders_po_number_legacy_unique
  on public.customer_purchase_orders (po_number)
  where customer_id is null;

create index if not exists customer_purchase_orders_customer_id_idx
  on public.customer_purchase_orders (customer_id);
create index if not exists customer_purchase_orders_priority_idx
  on public.customer_purchase_orders (priority);
create index if not exists customer_purchase_orders_action_required_idx
  on public.customer_purchase_orders (action_required)
  where action_required = true;
create index if not exists customer_purchase_orders_required_date_idx
  on public.customer_purchase_orders (required_date);

-- ---------------------------------------------------------------------------
-- Evolve PO items
-- ---------------------------------------------------------------------------

alter table public.customer_purchase_order_items
  add column if not exists line_number integer;

alter table public.customer_purchase_order_items
  add column if not exists product_name text;

alter table public.customer_purchase_order_items
  add column if not exists product_code text;

alter table public.customer_purchase_order_items
  add column if not exists specifications text;

alter table public.customer_purchase_order_items
  add column if not exists required_delivery_date date;

update public.customer_purchase_order_items
set product_name = coalesce(nullif(btrim(product_name), ''), product_species)
where product_name is null or btrim(product_name) = '';

update public.customer_purchase_order_items poi
set line_number = numbered.rn
from (
  select
    id,
    row_number() over (
      partition by customer_purchase_order_id
      order by created_at, id
    ) as rn
  from public.customer_purchase_order_items
) numbered
where poi.id = numbered.id
  and poi.line_number is null;

alter table public.customer_purchase_order_items
  alter column line_number set default 1;

alter table public.customer_purchase_order_items
  alter column line_number set not null;

create unique index if not exists customer_po_items_line_unique
  on public.customer_purchase_order_items (customer_purchase_order_id, line_number);

-- ---------------------------------------------------------------------------
-- Status history (separate from system-wide audit_logs)
-- ---------------------------------------------------------------------------

create table public.customer_purchase_order_status_history (
  id uuid primary key default gen_random_uuid(),
  customer_po_id uuid not null
    references public.customer_purchase_orders (id) on delete restrict,
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_by_name text,
  changed_at timestamptz not null default timezone('utc', now()),
  reason text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index customer_po_status_history_po_id_idx
  on public.customer_purchase_order_status_history (customer_po_id);
create index customer_po_status_history_changed_at_idx
  on public.customer_purchase_order_status_history (changed_at desc);

alter table public.customer_purchase_order_status_history enable row level security;

create policy customer_po_status_history_select_authenticated
  on public.customer_purchase_order_status_history for select to authenticated
  using (public.is_authenticated());

create policy customer_po_status_history_insert_authenticated
  on public.customer_purchase_order_status_history for insert to authenticated
  with check (public.is_authenticated());

-- ---------------------------------------------------------------------------
-- Email messages (provider-neutral idempotency foundation — no ingestion yet)
-- ---------------------------------------------------------------------------

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('gmail', 'microsoft365', 'imap', 'other')),
  external_message_id text not null,
  sender text,
  subject text,
  received_at timestamptz,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed')),
  linked_customer_po_id uuid
    references public.customer_purchase_orders (id) on delete set null,
  processed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_messages_provider_external_unique unique (provider, external_message_id)
);

create index email_messages_processing_status_idx
  on public.email_messages (processing_status);
create index email_messages_linked_customer_po_id_idx
  on public.email_messages (linked_customer_po_id);
create index email_messages_received_at_idx
  on public.email_messages (received_at);

create trigger email_messages_set_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

alter table public.email_messages enable row level security;

create policy email_messages_select_authenticated
  on public.email_messages for select to authenticated
  using (public.is_authenticated());

create policy email_messages_write_authenticated
  on public.email_messages for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

-- ---------------------------------------------------------------------------
-- Atomic Customer PO create (header + items + status history + audit)
-- ---------------------------------------------------------------------------

create or replace function public.create_customer_purchase_order(
  p_customer_id uuid,
  p_po_number text,
  p_po_date date,
  p_received_at timestamptz,
  p_required_delivery_date date,
  p_priority text,
  p_notes text,
  p_source text,
  p_created_by uuid,
  p_actor_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.customers%rowtype;
  v_po public.customer_purchase_orders%rowtype;
  v_item jsonb;
  v_line integer := 0;
  v_actor text;
  v_product_name text;
  v_quantity numeric(14, 3);
  v_item_id uuid;
  v_item_ids uuid[] := '{}';
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  if nullif(btrim(coalesce(p_po_number, '')), '') is null then
    raise exception 'PO number is required.';
  end if;

  if p_customer_id is null then
    raise exception 'Customer is required.';
  end if;

  if p_priority is null or p_priority not in ('normal', 'high', 'urgent') then
    raise exception 'Priority must be normal, high, or urgent.';
  end if;

  if p_source is null or p_source not in ('manual', 'email', 'api', 'import') then
    raise exception 'Invalid PO source.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one PO item is required.';
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.';
  end if;

  if v_customer.status <> 'active' then
    raise exception 'Customer is not active.';
  end if;

  if exists (
    select 1
    from public.customer_purchase_orders
    where customer_id = p_customer_id
      and lower(po_number) = lower(btrim(p_po_number))
  ) then
    raise exception 'A purchase order with this number already exists for the selected customer.';
  end if;

  insert into public.customer_purchase_orders (
    customer_id,
    customer_name,
    customer_reference,
    po_number,
    po_date,
    required_date,
    status,
    source,
    received_at,
    notes,
    priority,
    action_required,
    created_by
  )
  values (
    v_customer.id,
    v_customer.name,
    v_customer.customer_code,
    btrim(p_po_number),
    p_po_date,
    p_required_delivery_date,
    'received',
    p_source,
    coalesce(p_received_at, timezone('utc', now())),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_priority,
    false,
    p_created_by
  )
  returning * into v_po;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_line := v_line + 1;
    v_product_name := nullif(btrim(coalesce(v_item->>'product_name', v_item->>'product_species', '')), '');
    v_quantity := round(coalesce((v_item->>'quantity')::numeric, (v_item->>'requested_quantity')::numeric, 0), 3);

    if v_product_name is null then
      raise exception 'Product / species is required for each PO item.';
    end if;

    if v_quantity <= 0 then
      raise exception 'Each PO item quantity must be greater than zero.';
    end if;

    insert into public.customer_purchase_order_items (
      customer_purchase_order_id,
      line_number,
      product_name,
      product_species,
      product_code,
      requested_quantity,
      unit,
      required_delivery_date,
      specifications,
      notes,
      status
    )
    values (
      v_po.id,
      coalesce((v_item->>'line_number')::integer, v_line),
      v_product_name,
      coalesce(nullif(btrim(coalesce(v_item->>'species', '')), ''), v_product_name),
      nullif(btrim(coalesce(v_item->>'product_code', '')), ''),
      v_quantity,
      coalesce(nullif(btrim(coalesce(v_item->>'unit', '')), ''), 'kg'),
      nullif(v_item->>'required_delivery_date', '')::date,
      nullif(btrim(coalesce(v_item->>'specifications', '')), ''),
      nullif(btrim(coalesce(v_item->>'notes', '')), ''),
      'open'
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);
  end loop;

  insert into public.customer_purchase_order_status_history (
    customer_po_id,
    from_status,
    to_status,
    changed_by,
    changed_by_name,
    reason,
    notes
  )
  values (
    v_po.id,
    null,
    'received',
    p_created_by,
    v_actor,
    'Initial intake',
    'Customer PO created'
  );

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
  )
  values (
    p_created_by,
    v_actor,
    'Customer PO Created',
    'customer_purchase_order',
    v_po.id::text,
    v_po.po_number,
    'status',
    null,
    'received'
  ),
  (
    p_created_by,
    v_actor,
    'Customer PO Priority Changed',
    'customer_purchase_order',
    v_po.id::text,
    v_po.po_number,
    'priority',
    null,
    p_priority
  );

  return jsonb_build_object(
    'customer_purchase_order_id', v_po.id,
    'po_number', v_po.po_number,
    'status', v_po.status,
    'item_ids', to_jsonb(v_item_ids)
  );
end;
$$;

revoke all on function public.create_customer_purchase_order(
  uuid, text, date, timestamptz, date, text, text, text, uuid, text, jsonb
) from public;

grant execute on function public.create_customer_purchase_order(
  uuid, text, date, timestamptz, date, text, text, text, uuid, text, jsonb
) to authenticated;

grant execute on function public.create_customer_purchase_order(
  uuid, text, date, timestamptz, date, text, text, text, uuid, text, jsonb
) to service_role;

-- Status transition helper with history + audit
create or replace function public.change_customer_purchase_order_status(
  p_customer_po_id uuid,
  p_to_status text,
  p_reason text,
  p_notes text,
  p_changed_by uuid,
  p_actor_name text,
  p_mark_action_required boolean default null,
  p_action_required_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.customer_purchase_orders%rowtype;
  v_from text;
  v_actor text;
  v_action_required boolean;
begin
  v_actor := coalesce(nullif(btrim(coalesce(p_actor_name, '')), ''), 'System');

  if p_to_status is null or p_to_status not in (
    'received', 'under_review', 'action_required', 'approved',
    'partially_allocated', 'ready_for_fulfillment', 'fulfilled', 'cancelled'
  ) then
    raise exception 'Invalid customer PO status.';
  end if;

  select * into v_po
  from public.customer_purchase_orders
  where id = p_customer_po_id
  for update;

  if not found then
    raise exception 'Customer purchase order not found.';
  end if;

  v_from := v_po.status;
  if v_from = p_to_status
     and coalesce(p_mark_action_required, v_po.action_required) = v_po.action_required then
    raise exception 'No status change requested.';
  end if;

  v_action_required := case
    when p_mark_action_required is not null then p_mark_action_required
    when p_to_status = 'action_required' then true
    when p_to_status in ('approved', 'cancelled', 'fulfilled') then false
    else v_po.action_required
  end;

  if v_action_required and nullif(btrim(coalesce(p_action_required_reason, v_po.action_required_reason, p_reason, '')), '') is null then
    raise exception 'Action required reason is required.';
  end if;

  update public.customer_purchase_orders
  set
    status = p_to_status,
    action_required = v_action_required,
    action_required_reason = case
      when v_action_required then nullif(btrim(coalesce(p_action_required_reason, p_reason, '')), '')
      else null
    end,
    action_required_at = case when v_action_required then timezone('utc', now()) else null end,
    action_required_by = case when v_action_required then p_changed_by else null end,
    verified_at = case when p_to_status = 'approved' then coalesce(verified_at, timezone('utc', now())) else verified_at end,
    verified_by = case when p_to_status = 'approved' then coalesce(verified_by, p_changed_by) else verified_by end,
    updated_at = timezone('utc', now())
  where id = v_po.id
  returning * into v_po;

  insert into public.customer_purchase_order_status_history (
    customer_po_id, from_status, to_status, changed_by, changed_by_name, reason, notes
  )
  values (
    v_po.id, v_from, p_to_status, p_changed_by, v_actor,
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), '')
  );

  insert into public.audit_logs (
    user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
  )
  values (
    p_changed_by, v_actor, 'Customer PO Status Changed', 'customer_purchase_order',
    v_po.id::text, v_po.po_number, 'status', v_from, p_to_status
  );

  if v_action_required then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_changed_by, v_actor, 'Customer PO Marked Action Required', 'customer_purchase_order',
      v_po.id::text, v_po.po_number, 'action_required_reason', null, v_po.action_required_reason
    );
  end if;

  if p_to_status = 'approved' then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_changed_by, v_actor, 'Customer PO Approved', 'customer_purchase_order',
      v_po.id::text, v_po.po_number, 'status', v_from, 'approved'
    );
  end if;

  if p_to_status = 'cancelled' then
    insert into public.audit_logs (
      user_id, actor_name, action, entity_type, entity_id, entity_label, field_name, previous_value, new_value
    )
    values (
      p_changed_by, v_actor, 'Customer PO Cancelled', 'customer_purchase_order',
      v_po.id::text, v_po.po_number, 'status', v_from, 'cancelled'
    );
  end if;

  return jsonb_build_object(
    'customer_purchase_order_id', v_po.id,
    'from_status', v_from,
    'to_status', v_po.status,
    'action_required', v_po.action_required
  );
end;
$$;

revoke all on function public.change_customer_purchase_order_status(
  uuid, text, text, text, uuid, text, boolean, text
) from public;

grant execute on function public.change_customer_purchase_order_status(
  uuid, text, text, text, uuid, text, boolean, text
) to authenticated;

grant execute on function public.change_customer_purchase_order_status(
  uuid, text, text, text, uuid, text, boolean, text
) to service_role;
