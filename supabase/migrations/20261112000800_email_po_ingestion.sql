-- Migration 008: Step 6 email PO ingestion + Gmail foundation
-- Extends email_messages; adds attachments, provider connections, PO candidates

-- ---------------------------------------------------------------------------
-- Extend email_messages for intake metadata + action_required status
-- ---------------------------------------------------------------------------

alter table public.email_messages
  drop constraint if exists email_messages_processing_status_check;

alter table public.email_messages
  add constraint email_messages_processing_status_check
  check (processing_status in (
    'received',
    'processing',
    'processed',
    'ignored',
    'failed',
    'action_required'
  ));

alter table public.email_messages
  add column if not exists recipient text;

alter table public.email_messages
  add column if not exists thread_id text;

alter table public.email_messages
  add column if not exists snippet text;

alter table public.email_messages
  add column if not exists has_attachments boolean not null default false;

alter table public.email_messages
  add column if not exists body_text text;

alter table public.email_messages
  add column if not exists detection_label text
    check (detection_label is null or detection_label in ('likely_po', 'not_po', 'needs_review'));

alter table public.email_messages
  add column if not exists detection_score numeric(5, 2);

alter table public.email_messages
  add column if not exists action_required_reason text;

alter table public.email_messages
  drop constraint if exists email_messages_provider_check;

alter table public.email_messages
  add constraint email_messages_provider_check
  check (provider in ('gmail', 'microsoft365', 'imap', 'other', 'mock'));

create index if not exists email_messages_detection_label_idx
  on public.email_messages (detection_label);

create index if not exists email_messages_thread_id_idx
  on public.email_messages (thread_id);

-- ---------------------------------------------------------------------------
-- Provider connection + encrypted credential storage (server-side only)
-- ---------------------------------------------------------------------------

create table public.email_provider_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('gmail', 'microsoft365', 'imap', 'other', 'mock')),
  account_email text,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'connected', 'connection_error', 'disconnected')),
  scopes text[] not null default '{}',
  -- Ciphertext only. Never store plaintext refresh/access tokens.
  refresh_token_ciphertext text,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  token_metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_sync_result jsonb not null default '{}'::jsonb,
  last_error text,
  connected_by uuid references public.profiles (id) on delete set null,
  connected_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_provider_connections_provider_unique unique (provider)
);

create index email_provider_connections_status_idx
  on public.email_provider_connections (status);

create trigger email_provider_connections_set_updated_at
before update on public.email_provider_connections
for each row execute function public.set_updated_at();

alter table public.email_provider_connections enable row level security;

-- Authenticated users may read connection status metadata, not write credentials directly.
-- Writes go through service-role / server admin client.
create policy email_provider_connections_select_authenticated
  on public.email_provider_connections for select to authenticated
  using (public.is_authenticated());

comment on table public.email_provider_connections is
  'Provider OAuth connection status. Token ciphertext is server-only; never expose to clients.';

-- ---------------------------------------------------------------------------
-- Email attachments (metadata; binary via documents / storage_reference)
-- ---------------------------------------------------------------------------

create table public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid not null
    references public.email_messages (id) on delete restrict,
  external_attachment_id text,
  filename text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_reference text,
  document_id uuid references public.documents (id) on delete set null,
  extraction_status text not null default 'pending'
    check (extraction_status in (
      'pending',
      'unsupported',
      'extracted',
      'failed',
      'skipped'
    )),
  extraction_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index email_attachments_email_message_id_idx
  on public.email_attachments (email_message_id);
create index email_attachments_document_id_idx
  on public.email_attachments (document_id);

create trigger email_attachments_set_updated_at
before update on public.email_attachments
for each row execute function public.set_updated_at();

alter table public.email_attachments enable row level security;

create policy email_attachments_select_authenticated
  on public.email_attachments for select to authenticated
  using (public.is_authenticated());

create policy email_attachments_write_authenticated
  on public.email_attachments for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

-- ---------------------------------------------------------------------------
-- Email PO candidates (human review before Customer PO creation)
-- ---------------------------------------------------------------------------

create table public.email_po_candidates (
  id uuid primary key default gen_random_uuid(),
  email_message_id uuid not null
    references public.email_messages (id) on delete restrict,
  review_status text not null default 'new'
    check (review_status in (
      'new',
      'needs_review',
      'ready_to_confirm',
      'confirmed',
      'ignored',
      'failed'
    )),
  detection_label text
    check (detection_label is null or detection_label in ('likely_po', 'not_po', 'needs_review')),
  detection_score numeric(5, 2),
  customer_match_status text
    check (customer_match_status is null or customer_match_status in (
      'matched',
      'multiple_matches',
      'no_match'
    )),
  matched_customer_id uuid references public.customers (id) on delete set null,
  extracted_payload jsonb not null default '{}'::jsonb,
  edited_payload jsonb,
  warnings jsonb not null default '[]'::jsonb,
  action_required_reasons text[] not null default '{}',
  linked_customer_po_id uuid
    references public.customer_purchase_orders (id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  ignored_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_po_candidates_email_message_unique unique (email_message_id)
);

create index email_po_candidates_review_status_idx
  on public.email_po_candidates (review_status);
create index email_po_candidates_matched_customer_id_idx
  on public.email_po_candidates (matched_customer_id);
create index email_po_candidates_linked_customer_po_id_idx
  on public.email_po_candidates (linked_customer_po_id);

create trigger email_po_candidates_set_updated_at
before update on public.email_po_candidates
for each row execute function public.set_updated_at();

alter table public.email_po_candidates enable row level security;

create policy email_po_candidates_select_authenticated
  on public.email_po_candidates for select to authenticated
  using (public.is_authenticated());

create policy email_po_candidates_write_authenticated
  on public.email_po_candidates for all to authenticated
  using (public.is_authenticated())
  with check (public.is_authenticated());

comment on table public.email_po_candidates is
  'Extracted PO drafts awaiting human review. Extracted ≠ approved.';
