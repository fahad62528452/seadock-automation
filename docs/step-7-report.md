# Step 7 report: Allocation, fulfilment, final QAQC and dispatch

Flow implemented: Customer PO → Inventory Allocation → Reservation → Fulfilment → Final QAQC → Dispatch → Inventory Consumption. Steps 1–6 were not rewritten. The existing `fulfilments`, `fulfilment_items` and `final_qaqc` tables were extended, not recreated.

## 1. Files created

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261112000900_fulfilment_allocation.sql` | Schema changes, helpers, trigger, 8 functions |
| `src/types/fulfillment.ts` | Fulfilment, allocation, QAQC, reconciliation, batch usage and input types |
| `src/lib/fulfillment-labels.ts` | Labels for fulfilment, allocation and inventory type |
| `src/lib/fulfillment-validation.ts` | Allocation, fulfilment, final QAQC and dispatch input validation |
| `src/lib/mock/fulfillment-store.ts` | Mock persistence with the same rules as the RPCs |
| `src/services/fulfillment/fulfillment-service.ts` | `ServiceResult` service, mock/Supabase switch |
| `src/app/(shell)/customer-orders/fulfillment-actions.ts` | Server actions with permission checks |
| `src/app/(shell)/customer-orders/[id]/fulfill/page.tsx` | Allocation, fulfilment, QAQC and dispatch page |
| `src/components/customer-orders/fulfillment-forms.tsx` | Client forms (allocate, release, create, QAQC, dispatch, cancel) |
| `scripts/ts-alias-loader.mjs`, `scripts/register-ts-alias.mjs` | `@/` alias loader for the verification harness |
| `scripts/verify-fulfillment-mock.mjs` | 18 mock scenarios (`npm run verify:fulfillment`) |
| `docs/fulfillment-workflow.md` | Workflow documentation |
| `docs/step-7-report.md` | This report |

## 2. Files modified

- `src/types/database.ts`, `src/types/customer-orders.ts`: new columns, statuses and fulfilment summary on PO items.
- `src/lib/permissions.ts`: four permissions, labels, role mapping.
- `src/lib/customer-order-labels.ts`, `src/components/customer-orders/status-workflow.tsx`: `partially_fulfilled` and fulfilment-aware statuses.
- `src/lib/mock/procurement-store.ts`: `reservedQuantity`, seeded processed inventory, `getMockInventoryContext()`.
- `src/lib/mock/customer-order-store.ts`: seeded PO-1001, `fulfilledQuantity`, dashboard counts, `getMockCustomerOrderContext()`.
- `src/services/customer-orders/customer-order-service.ts`: fulfilment summary on the PO, cancel routed through `cancelPoReleasingAllocations`, dashboard stats.
- `src/services/dashboard/get-dashboard.ts`, `src/components/dashboard/dashboard-view.tsx`: six new cards in an "Allocation and fulfilment" section.
- `src/app/(shell)/customer-orders/page.tsx`: status filters and description.
- `src/app/(shell)/customer-orders/[id]/page.tsx`: allocation, fulfilment, QAQC and dispatch sections, "Allocate / Fulfil" link, per-item Reserved / Fulfilled / Remaining columns, cancelled alert. The "not implemented" copy is gone.
- `src/app/(shell)/inventory/batches/[id]/page.tsx`: Total / Reserved / Available / Dispatched and customer allocations via `getBatchFulfillmentUsage`.
- `src/app/(shell)/inventory/batches/page.tsx`, `processing/new/page.tsx`, `processing/[id]/page.tsx`: `await connection()` (see section 11).
- `scripts/validate-migrations.mjs`, `package.json`: new required tables, relationships, functions, `verify:fulfillment`.
- `docs/database-architecture.md`: Step 7 section.

## 3. Database changes

- `inventory_items.reserved_quantity numeric(14,3)`, with checks `>= 0` and `<= quantity`.
- New `inventory_allocations` (PO item, inventory item, batch, optional fulfilment, `allocated_quantity`, `fulfilled_quantity`, status `active|released|fulfilled`, actor and release fields). All foreign keys are `ON DELETE RESTRICT`. RLS enabled and indexed.
- `fulfilments`: `planned_date`, `vehicle_number`, `driver_name`, `dispatched_at`, `created_by`. `fulfilled_at` is now nullable. Statuses: `draft`, `ready`, `partially_dispatched`, `dispatched`, `fulfilled`, `cancelled`.
- `fulfilment_items`: `allocation_id`, `dispatched_quantity` (with `<= quantity`).
- `final_qaqc`: `quantity_checked`, result may be `on_hold`, unique per fulfilment.
- `fulfilment_number_counters` and `next_fulfilment_number()` → `FUL-YYYY-#####`.
- Customer PO statuses include `partially_fulfilled`.
- Helpers: `inventory_status_for`, `recalc_customer_po_fulfilment_status`.
- Trigger `guard_customer_po_cancel_allocations` blocks cancelling a PO that has active allocations.
- RPCs: `allocate_inventory_to_customer_po`, `release_inventory_allocation`, `create_fulfilment_from_allocations`, `record_final_qaqc`, `dispatch_fulfilment`, `cancel_fulfilment`, `cancel_customer_po_release_allocations`.

## 4. Allocation architecture

Allocation reserves stock against a PO item. It never moves physical stock.

- Inputs: PO item and lines `{inventory_item_id, quantity}`. A line set can span several batches.
- Eligible stock: processed or frozen, status available or reserved, matching species or product name and unit.
- Limits: quantity ≤ item Available and ≤ the PO item's unallocated quantity. Violations are rejected before any write.
- Effects: `reserved_quantity` increases, a `reservation` movement is written (previous = new = stock quantity), PO status is recalculated.
- Release: `release_inventory_allocation` lowers `reserved_quantity`, writes a `release` movement and recalculates the PO status.

## 5. Fulfilment, final QAQC and dispatch architecture

1. **Fulfilment**: `create_fulfilment_from_allocations` groups active, unattached allocations into a `draft` fulfilment with one `fulfilment_items` row each. Nothing is consumed.
2. **Final QAQC**: `record_final_qaqc` creates or updates the single `final_qaqc` row. `passed` and `conditional` move the fulfilment to `ready`. `failed` and `on_hold` keep or return it to `draft`. Failed requires notes.
3. **Dispatch**: `dispatch_fulfilment` takes a quantity per fulfilment item. It requires a passing QAQC, so a failed QAQC blocks dispatch. Partial dispatch is supported. Each dispatch writes a `dispatch` movement, reduces `quantity` and `reserved_quantity` together, updates `allocation.fulfilled_quantity`, `fulfilment_items.dispatched_quantity` and PO item `fulfilled_quantity`, then recalculates the PO status.
4. **Consumption**: Inventory is consumed by dispatch. Rows reaching zero are marked `dispatched`.
5. **Cancel**: `cancel_fulfilment` detaches allocations (they stay reserved). `cancel_customer_po_release_allocations` releases everything and cancels the PO, unless something was already dispatched.

Mock behaviour is identical: `src/lib/mock/fulfillment-store.ts` validates before it mutates.

## 6. Inventory model: AVAILABLE vs RESERVED vs DISPATCHED

| State | Definition | Changed by |
| --- | --- | --- |
| Total | `quantity` | Dispatch lowers it. Processing and wastage as before. |
| Reserved | `reserved_quantity` | Allocation raises it. Release and dispatch lower it. |
| Available | `quantity - reserved_quantity` | Derived. |
| Dispatched | `fulfilled_quantity` on allocations, `dispatched_quantity` on fulfilment items | Dispatch only. |

The UI shows Total / Reserved / Available on the fulfil page and on the batch detail page.

## 7. Concurrency

- All write RPCs are `security definer` and run in a single transaction.
- Lock order, always: customer PO → fulfilment → inventory items sorted by id → children. This prevents deadlocks.
- Lines are aggregated per inventory item before locking, so one call cannot double-count the same row.
- Availability and PO-quantity checks run after the locks are held, so two concurrent allocations cannot both succeed against the same stock.
- Backstops: `reserved_quantity <= quantity`, `fulfilled_quantity <= allocated_quantity`, `dispatched_quantity <= quantity`, unique `final_qaqc(fulfilment_id)`.

## 8. Permissions

| Permission | Roles |
| --- | --- |
| `customer_orders.allocate` | super_admin, manager, warehouse_manager |
| `customer_orders.fulfill` | super_admin, manager, warehouse_manager |
| `customer_orders.qaqc` | super_admin, manager, warehouse_manager |
| `customer_orders.dispatch` | super_admin, manager, warehouse_manager, warehouse_staff |

`data_entry` never receives dispatch. Server actions check the matching permission, and the UI hides controls with `<Can>`. PO cancellation continues to use `customer_orders.status`.

## 9. Audit and traceability

Audit entries (in `audit_logs`, written by the RPCs in the same transaction, and in the mock audit list): Inventory Allocated, Inventory Allocation Released, Fulfilment Created, Fulfilment Status Changed (final QAQC), Inventory Dispatched, Fulfilment Dispatched, Fulfilment Cancelled, Customer PO Status Changed, Customer PO Cancelled. PO detail merges these into its audit trail.

Inventory movements: `reservation`, `release`, `dispatch`, all with reference type and id.

Traceability chain: Customer PO item → `inventory_allocations` → `inventory_items` → parent `batches` → processing run → receipt and vendor. `fulfilment_items.allocation_id` preserves the link for dispatched lines. The batch detail page lists every PO that holds or has consumed stock from that batch.

## 10. Validation results

| Command | Result |
| --- | --- |
| `npm run lint` | Passes |
| `npx tsc --noEmit` | Passes |
| `npm run db:validate` | Passes: 9 migrations and 30 tables |
| `npm run build` | Passes |
| `npm run verify:fulfillment` | 18 of 18 scenarios pass |

Scenarios cover: seeds, partial allocation, over-allocation reject (stock and PO quantity), wastage and raw rejection, multi-batch, release, fulfilment creation, dispatch blocked before and after failed QAQC, conditional QAQC, partial dispatch, final dispatch, batch usage, cancel releasing allocations, cancel fulfilment re-grouping.

A production server smoke test returned 200 for the dashboard, PO list, PO detail, fulfil page, batch list, batch detail and processing pages, with no prerender errors.

## 11. Limitations and notes

- The new SQL migration has been structurally validated (`db:validate`) but not executed against a live Postgres or Supabase instance in this environment. The mock path is fully exercised. Run the migration against a real database and repeat the scenarios before relying on it.
- Seeding processed inventory makes the mock batch list non-empty at build time, which exposed `new Date()` in the fresh-window code during prerender. Time-dependent pages (`/inventory/batches`, batch detail, fulfil, processing new and detail) now call `await connection()`.
- The mock keeps its own audit arrays, matching the existing mock stores, instead of calling `recordAuditEntry`.
- Allocation is manual. There is no automatic FIFO or best-fit suggestion.
- One final QAQC row per fulfilment: re-inspection overwrites the row. Earlier results survive only in the audit trail.
- Dispatch records vehicle and driver as free text. No documents, delivery notes or proof of delivery.
- The legacy Inventory pages (`/inventory`, `/inventory/frozen`, `/inventory/fresh`) are still placeholders, so Total / Reserved / Available is shown on the fulfil and batch pages only.
- Out of scope per the brief: fresh→frozen automation, wastage sales, advanced reporting, customer portal, Microsoft Graph, OCR, AI, email polling, GPS, route optimisation.
