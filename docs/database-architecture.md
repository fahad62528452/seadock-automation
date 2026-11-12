# SeaDock database architecture

SeaDock uses **Supabase PostgreSQL** as the operational source of truth. Document files will live in **Supabase Storage**; PostgreSQL stores only document metadata.

## Responsibility split

| Layer | Responsibility |
| --- | --- |
| Next.js UI | Presentation only. No direct table writes. |
| SeaDock services / server APIs | Validation, business rules, permissions, orchestration |
| Supabase Auth | Identity and session (credentials not stored in SeaDock tables) |
| Supabase PostgreSQL | Relational operational data and audit history |
| Supabase Storage | Binary attachments referenced by `documents` |

Application permission checks (`src/lib/permissions.ts`) remain separate from Row Level Security. RLS blocks anonymous/public access; the app still enforces role-based actions.

## Persistence switch

| Setting | Behaviour |
| --- | --- |
| `SEADOCK_DATA_SOURCE=mock` (default) | Sample/mock data for UI development |
| `SEADOCK_DATA_SOURCE=supabase` | Services may read/write PostgreSQL through Supabase clients |

Dashboard overview cards still use mock snapshot data in Step 2. Audit can use PostgreSQL when the switch is set to `supabase`.

## Tables

### Organization

- **profiles** — SeaDock user profile and role. `id` matches `auth.users.id`.

### Procurement

- **vendors** — Supplier master data
- **purchase_orders** — Procurement POs
- **purchase_order_items** — Relational PO lines
- **goods_receipts** — Physical receiving events against a PO
- **goods_receipt_items** — Received quantities linked to PO lines

### Traceability core

- **batches** — Parent lot identity (`batch_number` unique). Created from receiving and retained through the lifecycle.

### Processing and inventory

- **processing_runs** — One parent batch may have many runs. Stores input, processed yield, and wastage quantities.
- **inventory_items** — Stock identities (`raw`, `processed`, `frozen`, `wastage`) linked to batch and optional processing run
- **inventory_movements** — Historical quantity changes with `previous_quantity` and `new_quantity`

### Customer side

- **customer_purchase_orders** / **customer_purchase_order_items** — Demand records
- **fulfilments** / **fulfilment_items** — Dispatch records preserving customer PO, inventory item, and parent batch

### Quality, audit, files

- **incoming_qaqc** — Linked to goods receipt / batch
- **processing_qaqc** — Linked to processing run / batch
- **final_qaqc** — Linked to customer PO / fulfilment / batch
- **audit_logs** — Who / what / field / previous / new / when
- **documents** — Storage path metadata for attachments

## Major relationships

```text
vendors
  └── purchase_orders
        └── purchase_order_items
        └── goods_receipts
              └── goods_receipt_items → purchase_order_items
              └── batches
                    └── processing_runs
                          └── inventory_items (processed / wastage)
                    └── inventory_items (raw / frozen)
                          └── inventory_movements
                    └── fulfilment_items
customer_purchase_orders
  └── customer_purchase_order_items
  └── fulfilments
        └── fulfilment_items → inventory_items + batches
```

## Traceability chain

```text
Vendor
  → Purchase Order
  → Goods Receipt
  → Parent Batch
  → Processing Run
  → Processed / Wastage Inventory
  → Inventory Movement
  → Customer PO
  → Fulfilment
```

Also supported:

```text
Parent Batch
  → many Processing Runs
  → many Inventory Items
  → many Inventory Movements
```

## Inventory movement approach

Current balances live on `inventory_items.quantity`. Every meaningful change should also create an `inventory_movements` row that records:

- movement type
- quantity delta
- previous quantity
- new quantity
- optional reference (`reference_type` / `reference_id`)
- actor and timestamp

Do not treat `UPDATE inventory_items SET quantity = …` alone as a complete history.

Wastage is first-class inventory (`inventory_type = 'wastage'`) linked to the processing run and parent batch so it can later be sold or transferred without losing origin.

## Audit approach

`audit_logs` stores:

- user_id / actor_name
- action
- entity_type / entity_id / entity_label
- field_name
- previous_value / new_value
- created_at

Application services write audit entries. Users may insert/select through RLS; updates/deletes are not granted to authenticated users.

## Historical record policy

Operational foreign keys use `ON DELETE RESTRICT` so receiving, batches, processing, inventory movements, fulfilment, and audit rows are not removed by cascading deletes. Prefer status / archive fields over destructive deletion.

## Migrations

| File | Scope |
| --- | --- |
| `20261112000100_core_procurement.sql` | profiles, vendors, POs, receiving + RLS |
| `20261112000200_batches_processing_inventory.sql` | batches, processing, inventory + RLS |
| `20261112000300_customer_orders_fulfilment.sql` | customer POs, fulfilment + RLS |
| `20261112000400_qaqc_audit_documents.sql` | QAQC, audit, documents + RLS |
| `20261112000500_receiving_workflow.sql` | PO/QAQC status alignment, batch counters, `complete_receiving_workflow` RPC |
| `20261112000600_processing_workflow.sql` | Processing statuses, run counters, movement types, `complete_processing_workflow` RPC |
| `20261112000700_customer_po_intake.sql` | Customers, Customer PO intake fields, status history, email_messages, create/change RPCs |
| `20261112000800_email_po_ingestion.sql` | Email PO ingestion |
| `20261112000900_fulfilment_allocation.sql` | `inventory_allocations`, `reserved_quantity`, fulfilment/final QAQC extensions, allocation and dispatch RPCs |
| `20261113001000_inventory_lifecycle.sql` | `inventory_items.frozen_at`, `fresh_to_frozen` movement type, `freeze_eligible_inventory` RPC |

## Step 3 clarifications

- Purchase order statuses used by the receiving workflow include `issued`, `partially_received`, `received`, `closed`, and `cancelled`.
- Incoming QAQC results include `passed`, `failed`, and `conditional`.
- Goods receipt statuses include `accepted` and `rejected` for post-QAQC outcomes.
- `batch_number_counters` supports human-readable `BATCH-YYYY-#####` allocation.
- Receiving → QAQC → batch → inventory → movement is executed by `complete_receiving_workflow` as one PostgreSQL transaction.

## Step 4 clarifications

- Processing run statuses: `draft`, `in_progress`, `completed`, `cancelled` (`pending` migrated to `draft`).
- `processing_runs.operator_name` stores the operational operator display name.
- Inventory movement types include `processing_consumption`, `processing_yield`, and `processing_wastage`.
- `processing_run_number_counters` supports human-readable `RUN-YYYY-#####` allocation.
- Processing completion is transactional via `complete_processing_workflow` (draft create via `create_processing_run_draft`).
- Processed and wastage inventory rows reference the same parent `batches` row and the creating `processing_runs` row.

## Step 5 clarifications

- `customers` is the operational customer master (`CUST-#####` via `next_customer_code()`).
- Customer PO uniqueness is `(customer_id, po_number)`.
- Intake statuses include `received`, `under_review`, `action_required`, `approved`, plus later fulfilment-oriented values.
- `customer_purchase_order_status_history` stores PO status transitions separately from `audit_logs`.
- `email_messages` is a provider-neutral idempotency table only; no email provider is connected yet.
- Transactional create: `create_customer_purchase_order`. Status changes: `change_customer_purchase_order_status`.

## Step 7 clarifications

- `inventory_items.reserved_quantity` holds stock promised to active allocations. Constraints: `reserved_quantity >= 0` and `reserved_quantity <= quantity`.
- `inventory_allocations` links a customer PO item to an inventory item and its parent batch (`ON DELETE RESTRICT`). It carries `allocated_quantity`, `fulfilled_quantity`, `status` (`active`, `released`, `fulfilled`) and an optional `fulfilment_id`.
- `fulfilments` gained `planned_date`, `vehicle_number`, `driver_name`, `dispatched_at`, `created_by`. Statuses: `draft`, `ready`, `partially_dispatched`, `dispatched`, `fulfilled`, `cancelled`.
- `fulfilment_items` gained `allocation_id` and `dispatched_quantity`.
- `final_qaqc` gained `quantity_checked` and a unique `fulfilment_id`. It is distinct from incoming and processing QAQC.
- `fulfilment_number_counters` / `next_fulfilment_number()` return `FUL-YYYY-#####`.
- Customer PO status adds `partially_fulfilled` as a first-class value.
- A trigger blocks cancelling a PO that still has active allocations.
- Existing movement types now used: `reservation`, `release`, `dispatch`.
- RPCs (all write `audit_logs`): `allocate_inventory_to_customer_po`, `release_inventory_allocation`, `create_fulfilment_from_allocations`, `record_final_qaqc`, `dispatch_fulfilment`, `cancel_fulfilment`, `cancel_customer_po_release_allocations`, `recalc_customer_po_fulfilment_status`.

### AVAILABLE vs RESERVED vs DISPATCHED

| State | Where it lives | Effect on `quantity` | Effect on `reserved_quantity` |
| --- | --- | --- | --- |
| Available | `quantity - reserved_quantity` | none | none |
| Reserved | `reserved_quantity`, `inventory_allocations.status = 'active'` | unchanged by allocation or release | raised by allocation, lowered by release |
| Dispatched | `inventory_allocations.fulfilled_quantity`, `fulfilment_items.dispatched_quantity`, `dispatch` movement | lowered | lowered by the same amount |

Allocation and release movements record `previous_quantity = new_quantity` (physical stock does not change). Dispatch movements record the real decrease.

## Step 9 clarifications

Step 9 adds warehouse operational pages (`/fulfilment`, `/fulfilment/[id]`, QAQC queue) on top of Step 7/8 fulfilment RPCs and read models. **No schema changes.**

## Step 10 clarifications

Step 10 adds cross-module mock E2E verification (`npm run verify:e2e`, `scripts/verify-e2e-mock.mjs`) covering procurement through dispatch, freeze, cancellation, permissions, and fulfilment audits. **No schema changes.** Permissions in scenario I are validated at the app layer via `hasPermission`; database RLS remains unchanged.

## Step 8 clarifications

- `inventory_items.frozen_at` records when raw/processed stock was reclassified as frozen. Parent `batch_id` never changes.
- Fresh vs frozen is a lifecycle classification on the existing `inventory_type` column (`raw` / `processed` → `frozen`). It is independent of reserved/available.
- Origin timestamps for the 2-day fresh window: raw → `batches.received_at`; processed → `inventory_items.created_at`.
- Movement type `fresh_to_frozen` is a zero-delta reclassification (`quantity = 0` allowed only for this type; `previous_quantity = new_quantity`).
- RPC `freeze_eligible_inventory(p_actor, p_now)` locks eligible rows, freezes idempotently, preserves `reserved_quantity` and allocations, and audits `Inventory Frozen`.
- Operational inventory UI reads through `src/services/inventory/inventory-service.ts` only (no second balance model).

## Environment

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SEADOCK_DATA_SOURCE=mock|supabase
```

- Anon key: browser + authenticated server client
- Service role key: server-only admin client (`src/lib/supabase/admin.ts`)
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to Client Components
