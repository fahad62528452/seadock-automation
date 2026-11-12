-- Migration 004: QAQC, audit logs, document metadata

-- ---------------------------------------------------------------------------
-- Incoming QAQC (receiving / batch)
-- ---------------------------------------------------------------------------

create table public.incoming_qaqc (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references public.goods_receipts (id) on delete restrict,
  batch_id uuid references public.batches (id) on delete restrict,
  inspection_date date not null default (timezone('utc', now()))::date,
  inspector_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  result text
    check (result is null or result in ('passed', 'failed', 'on_hold')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index incoming_qaqc_goods_receipt_id_idx on public.incoming_qaqc (goods_receipt_id);
create index incoming_qaqc_batch_id_idx on public.incoming_qaqc (batch_id);
create index incoming_qaqc_status_idx on public.incoming_qaqc (status);

create trigger incoming_qaqc_set_updated_at
before update on public.incoming_qaqc
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Processing QAQC
-- ---------------------------------------------------------------------------

create table public.processing_qaqc (
  id uuid primary key default gen_random_uuid(),
  processing_run_id uuid not null references public.processing_runs (id) on delete restrict,
  batch_id uuid not null references public.batches (id) on delete restrict,
  inspection_date date not null default (timezone('utc', now()))::date,
  inspector_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  result text
    check (result is null or result in ('passed', 'failed', 'on_hold')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index processing_qaqc_processing_run_id_idx on public.processing_qaqc (processing_run_id);
create index processing_qaqc_batch_id_idx on public.processing_qaqc (batch_id);
create index processing_qaqc_status_idx on public.processing_qaqc (status);

create trigger processing_qaqc_set_updated_at
before update on public.processing_qaqc
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Final QAQC (before / with fulfilment)
-- ---------------------------------------------------------------------------

create table public.final_qaqc (
  id uuid primary key default gen_random_uuid(),
  customer_purchase_order_id uuid not null
    references public.customer_purchase_orders (id) on delete restrict,
  fulfilment_id uuid references public.fulfilments (id) on delete restrict,
  batch_id uuid references public.batches (id) on delete restrict,
  inspection_date date not null default (timezone('utc', now()))::date,
  inspector_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  result text
    check (result is null or result in ('passed', 'failed', 'on_hold')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index final_qaqc_customer_purchase_order_id_idx
  on public.final_qaqc (customer_purchase_order_id);
create index final_qaqc_fulfilment_id_idx on public.final_qaqc (fulfilment_id);
create index final_qaqc_batch_id_idx on public.final_qaqc (batch_id);
create index final_qaqc_status_idx on public.final_qaqc (status);

create trigger final_qaqc_set_updated_at
before update on public.final_qaqc
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit logs (append-oriented operational history)
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  entity_label text,
  field_name text,
  previous_value text,
  new_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);

comment on table public.audit_logs is
  'Who changed what, on which record/field, with previous and new values.';

-- ---------------------------------------------------------------------------
-- Documents (Supabase Storage metadata)
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  entity_type text not null,
  entity_id uuid not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint documents_storage_path_unique unique (storage_path)
);

create index documents_entity_idx on public.documents (entity_type, entity_id);
create index documents_uploaded_by_idx on public.documents (uploaded_by);

comment on table public.documents is
  'Metadata for files stored in Supabase Storage. Binary content is not stored in PostgreSQL.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.incoming_qaqc enable row level security;
alter table public.processing_qaqc enable row level security;
alter table public.final_qaqc enable row level security;
alter table public.audit_logs enable row level security;
alter table public.documents enable row level security;

create policy incoming_qaqc_select_authenticated
  on public.incoming_qaqc for select to authenticated
  using (public.is_authenticated());

create policy incoming_qaqc_write_authenticated
  on public.incoming_qaqc for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy processing_qaqc_select_authenticated
  on public.processing_qaqc for select to authenticated
  using (public.is_authenticated());

create policy processing_qaqc_write_authenticated
  on public.processing_qaqc for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy final_qaqc_select_authenticated
  on public.final_qaqc for select to authenticated
  using (public.is_authenticated());

create policy final_qaqc_write_authenticated
  on public.final_qaqc for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

create policy audit_logs_select_authenticated
  on public.audit_logs for select to authenticated
  using (public.is_authenticated());

create policy audit_logs_insert_authenticated
  on public.audit_logs for insert to authenticated
  with check (public.is_authenticated());

create policy documents_select_authenticated
  on public.documents for select to authenticated
  using (public.is_authenticated());

create policy documents_write_authenticated
  on public.documents for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());
