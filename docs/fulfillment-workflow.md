# Fulfilment workflow (Step 7)

Step 7 connects approved Customer POs to processed and frozen inventory. Stock is allocated and reserved, grouped into a fulfilment, inspected in a final QAQC, dispatched, and then consumed from inventory.

```text
Customer PO (approved)
  ↓
Inventory Allocation  ──►  Reservation (reserved_quantity)
  ↓
Fulfilment (draft = awaiting final QAQC)
  ↓
Final QAQC (passed | conditional | failed | on_hold)
  ↓
Dispatch (full or partial)  ──►  Inventory Consumption (quantity and reserved_quantity both reduced)
```

Steps 1–6 are unchanged. Step 7 extends the existing `fulfilments`, `fulfilment_items` and `final_qaqc` tables.

## Stock model

| Term | Meaning |
| --- | --- |
| Total (`quantity`) | Physical stock on hand. Reduced only by dispatch, processing consumption and wastage. |
| Reserved (`reserved_quantity`) | Portion of Total promised to active allocations and not yet dispatched. |
| Available | `quantity - reserved_quantity`. This is the only quantity that can be allocated. |
| Dispatched | Quantity that has left the facility. It is no longer part of Total. |

- **Allocation** raises Reserved. Total is unchanged.
- **Release** lowers Reserved. Total is unchanged.
- **Dispatch** lowers Total and Reserved together, so Available stays the same.
- The UI shows Total / Reserved / Available wherever sellable inventory is listed (fulfil page, batch detail).

Inventory item status is derived: `reserved` when Reserved ≥ Total, `available` when some stock is free, and `dispatched` when Total reaches 0.

## Allocation rules

- Only **processed** or **frozen** inventory can be allocated. Wastage and raw inventory are rejected, each with its own message.
- The inventory item must be `available` or `reserved`.
- The product must match the PO item species or product name (case-insensitive) and the units must match.
- The quantity must be greater than 0, must not exceed the item's Available quantity, and must not exceed the PO item's unallocated quantity.
- The PO must be `approved`, `partially_allocated`, `ready_for_fulfillment` or `partially_fulfilled`.
- One PO item may be filled from several batches. One call may span several inventory items (multi-batch).
- Over-allocation is rejected before any change is made.

## Allocation status

| Status | Meaning |
| --- | --- |
| `active` (Reserved) | Stock is reserved. Open reservation = allocated − fulfilled. |
| `fulfilled` (Dispatched) | The full allocated quantity has been dispatched. |
| `released` | Reservation was given back to Available. |

`inventory_allocations.fulfilled_quantity` tracks partial dispatch, so an allocation stays `active` until everything is out.

## Fulfilment status

| Status | Meaning |
| --- | --- |
| `draft` | Awaiting final QAQC. |
| `ready` | Final QAQC passed or conditional. Dispatch is allowed. |
| `partially_dispatched` | Some quantity has been dispatched. |
| `dispatched` | All items of this fulfilment are out, but the PO is not yet fulfilled. |
| `fulfilled` | All items are out and the PO is fulfilled. |
| `cancelled` | Terminal. Allocations are detached and stay reserved. |

A failed (or on-hold) final QAQC on a `ready` fulfilment returns it to `draft`. Each fulfilment has one `final_qaqc` row, updated in place. Failure notes are required.

## Dispatch

- Allowed only when the fulfilment is `ready`, or `partially_dispatched`, and the latest final QAQC is `passed` or `conditional`.
- A failed QAQC blocks dispatch. The fulfil page shows a blocked alert.
- Dispatch takes a quantity per fulfilment item (partial dispatch), plus vehicle number and driver name.
- Each dispatch writes a `dispatch` inventory movement per inventory item (Total decreases) and reduces `reserved_quantity` by the same amount.
- Never available to `data_entry`.

## Customer PO status recalculation

`recalc_customer_po_fulfilment_status` runs inside every RPC, only for POs in `approved`, `partially_allocated`, `ready_for_fulfillment`, `partially_fulfilled` or `fulfilled`:

1. Fulfilled ≥ requested → `fulfilled`
2. Fulfilled > 0 → `partially_fulfilled`
3. Open reservations + fulfilled ≥ requested → `ready_for_fulfillment`
4. Open reservations > 0 → `partially_allocated`
5. Otherwise → `approved`

Allocation never marks a PO fulfilled. Only dispatch does.

## Cancellation and release

- Cancelling a PO calls `cancel_customer_po_release_allocations`. It releases every active reservation, then cancels the PO.
- Cancelling a PO is blocked if any quantity has already been dispatched.
- A database trigger blocks setting a PO to `cancelled` while it still holds active allocations. This protects direct status updates.
- An allocation attached to a live fulfilment cannot be released directly. Use **Cancel fulfilment** first. It detaches the allocations and keeps them reserved, so they can be re-grouped or released.

## Database functions

All are `security definer`, granted to `authenticated` and `service_role`, and revoked from `public`. Each writes `audit_logs` and `inventory_movements` in the same transaction.

| Function | Purpose |
| --- | --- |
| `allocate_inventory_to_customer_po` | Reserve inventory lines against a PO item. |
| `release_inventory_allocation` | Release an unattached active allocation. |
| `create_fulfilment_from_allocations` | Group active allocations into a `draft` fulfilment (`FUL-YYYY-#####`). |
| `record_final_qaqc` | Create or update the fulfilment's final QAQC and move it between `draft` and `ready`. |
| `dispatch_fulfilment` | Dispatch quantities, consume inventory, update allocations and PO status. |
| `cancel_fulfilment` | Cancel a fulfilment and detach its allocations. |
| `cancel_customer_po_release_allocations` | Release all reservations and cancel the PO. |
| `recalc_customer_po_fulfilment_status` | Internal status recalculation. |

### Concurrency

Every RPC takes row locks in the same order: **customer PO → fulfilment → inventory items sorted by id → child rows**. Lines are aggregated per inventory item before locking. A consistent order prevents deadlocks, and `FOR UPDATE` prevents two users reserving the same stock at once. CHECK constraints (`reserved_quantity <= quantity`) are the last line of defence.

## Permissions

| Permission | Roles |
| --- | --- |
| `customer_orders.allocate` | super_admin, manager, warehouse_manager |
| `customer_orders.fulfill` | super_admin, manager, warehouse_manager |
| `customer_orders.qaqc` | super_admin, manager, warehouse_manager |
| `customer_orders.dispatch` | super_admin, manager, warehouse_manager, warehouse_staff |

`data_entry` never receives dispatch. Cancelling a PO still uses the existing `customer_orders.status` permission.

## UI

| Route | Purpose |
| --- | --- |
| `/customer-orders/[id]` | PO detail with allocation, fulfilment, QAQC and dispatch sections and a link to the fulfil page. |
| `/customer-orders/[id]/fulfill` | Item reconciliation, allocation panels, fulfilments, final QAQC and dispatch forms. |
| `/fulfilment` | Warehouse operations board: ready for fulfilment, awaiting final QAQC, QAQC blocks, ready to dispatch, completed. |
| `/fulfilment/[id]` | Fulfilment workspace: item and traceability detail, final QAQC, dispatch, cancel. |
| `/qaqc/final` | Final QAQC queue (awaiting and blocked buckets from the operations board). |
| `/orders/pending`, `/orders/fulfilled` | Redirect into `/fulfilment` (completed via `?bucket=completed`). |
| `/inventory/batches/[id]` | Batch usage: Total / Reserved / Available, plus customer allocations against the batch. |
| Dashboard | POs Awaiting Allocation, Partially Allocated, Ready for Fulfillment, Awaiting Final QAQC, Ready for Dispatch, Partially Fulfilled. |

Server actions live in `src/app/(shell)/customer-orders/fulfillment-actions.ts`.

## Traceability

```text
Customer PO item
  → inventory_allocations
  → inventory_items (processed / frozen)
  → batches (parent batch number)
  → processing_runs → raw receipt → vendor
```

Dispatch keeps `fulfilment_items.allocation_id`, so a dispatched line can be traced back to the exact inventory item and parent batch.

## Step 9 operational fulfilment (warehouse UI)

Step 9 adds read models and pages only. Step 7 RPCs, allocation logic and inventory rules are unchanged.

| Bucket | Meaning |
| --- | --- |
| Ready for fulfilment | Customer POs with **active, unattached** allocations (reserved stock, no fulfilment yet). |
| Awaiting final QAQC | Fulfilment in `draft` without a blocking QAQC result. |
| Blocked — QAQC | Fulfilment in `draft` or `ready` with **failed** or **on_hold** final QAQC (`canDispatch` is false). |
| Ready to dispatch | `ready` or `partially_dispatched` with passing QAQC and quantity remaining. |
| Completed | `dispatched` or `fulfilled`. |

**Allocated vs reserved:** allocation raises `reserved_quantity` on inventory; it does not reduce physical stock. **Fulfilled vs dispatched:** PO line `fulfilled_quantity` and fulfilment item `dispatched_quantity` move only on dispatch, which reduces both `quantity` and `reserved_quantity`. **Failed QAQC:** keeps or returns the fulfilment to `draft` and blocks dispatch until a passed or conditional result is recorded. **Inventory consumption** happens only on dispatch.

Permissions are enforced in server actions (`requirePermission`): `customer_orders.qaqc`, `customer_orders.dispatch`, `customer_orders.fulfill`. Warehouse staff can dispatch; warehouse managers hold fulfil and QAQC; data entry has none of these.

## Mock mode

`src/lib/mock/fulfillment-store.ts` implements the same rules for `SEADOCK_DATA_SOURCE=mock`. It seeds PO-1001 as approved (Frozen Fish Fillet, 500 kg) and two processed inventory rows: `inv_proc_0012` (300 kg, `BATCH-2026-00012`) and `inv_proc_0018` (250 kg, `BATCH-2026-00018`). Run `npm run verify:fulfillment` for Step 7 scenarios, `npm run verify:fulfilment-ops` for the Step 9 operational board checks, and `npm run verify:e2e` for Step 10 end-to-end mock coverage (allocate → fulfil → QAQC → dispatch with isolated entity IDs).

## Out of scope

Fresh→frozen automation, wastage sales, advanced reporting, customer portal, Microsoft Graph, OCR, AI, email polling, GPS and route optimisation.
