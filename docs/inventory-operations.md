# SeaDock inventory operations (Step 8)

Operational inventory visibility and the fresh → frozen lifecycle on top of the Step 7 allocation / fulfilmentment architecture.

## 1. Inventory architecture

SeaDock keeps **one** inventory source of truth:

| Concept | Storage |
| --- | --- |
| Physical on-hand | `inventory_items.quantity` |
| Reserved for customers | `inventory_items.reserved_quantity` |
| Allocation records | `inventory_allocations` |
| History | `inventory_movements` |
| Product class | `inventory_items.inventory_type` (`raw`, `processed`, `frozen`, `wastage`) |
| Freeze timestamp | `inventory_items.frozen_at` |

There is no second balance table, reservation system, or ledger.

Central read/balance layer: `src/services/inventory/inventory-service.ts`  
Lifecycle rules: `src/lib/inventory-lifecycle.ts` + `src/lib/fresh-window.ts`

## 2. Step 7 allocation architecture (unchanged)

```text
Customer PO item
  → inventory item (processed | frozen)
  → inventory_allocations (active)
  → reserved_quantity increases
  → reservation movement
```

Fulfilment and dispatch consume reserved stock transactionally via existing RPCs. Step 8 does **not** replace those RPCs.

## 3–5. Quantity model

| Metric | Definition | Source |
| --- | --- | --- |
| **TOTAL** | On-hand stock | Sum of `inventory_items.quantity` |
| **RESERVED** | Open customer commitment still held | Sum of `inventory_items.reserved_quantity` |
| **AVAILABLE** | Uncommitted on-hand | `quantity - reserved_quantity` |
| **ALLOCATED (inventory summary)** | Intentionally identical to **RESERVED** | `InventoryBalanceSummary.allocatedQuantity` is assigned from `reserved_quantity` |

### Allocated vs reserved (explicit)

In Step 7, `inventory_items.reserved_quantity` is the open reserved commitment:

`open reserved = sum(active allocations: allocated_quantity − fulfilled_quantity)`

It is **not** always equal to the sum of `inventory_allocations.allocated_quantity` after partial dispatch (because `allocated_quantity` stays on the allocation row while `fulfilled_quantity` rises and `reserved_quantity` falls).

Step 8 inventory summary therefore treats **allocated ≡ reserved** as the open commitment figure only. Allocation tables continue to show raw `allocated_quantity` / `fulfilled_quantity` from Step 7.

### Fulfilled vs dispatched (explicit)

There is no separate “fulfilled but not yet dispatched” stock quantity in Step 7.

- Creating a fulfilment attaches allocations; it does **not** consume stock.
- **Dispatch** is the consumption event: it writes `inventory_movements` (`dispatch`), increments `inventory_allocations.fulfilled_quantity`, increments `fulfilment_items.dispatched_quantity`, and reduces `quantity` + `reserved_quantity` together.

So:

| Field / UI | Meaning |
| --- | --- |
| `inventory_allocations.fulfilled_quantity` | Quantity dispatched against that allocation |
| `fulfilment_items.dispatched_quantity` | Quantity dispatched on that fulfilment line |
| Inventory summary `fulfilledQuantity` | Absolute sum of `dispatch` movements (ledger view) |
| Batch “Dispatched to customers” | Sum of allocation `fulfilled_quantity` (sellable / Step 7 usage view) |

Same business event; two read models (movement ledger vs allocation usage). Labels must not call allocation `allocated_quantity` “reserved”.

Fresh / frozen is **not** a synonym for available / unavailable.

## 6–8. Allocation, fulfilment, dispatch

Reuse Step 7 services and RPCs:

- `allocate_inventory_to_customer_po`
- `release_inventory_allocation`
- `create_fulfilment_from_allocations`
- `record_final_qaqc`
- `dispatch_fulfilment`
- `cancel_fulfilment`
- `cancel_customer_po_release_allocations`

Dispatch lowers both `quantity` and `reserved_quantity` and writes a `dispatch` movement.

## 9–11. Raw, processed, wastage

| Type | Origin |
| --- | --- |
| **Raw** | Accepted goods receiving → parent batch → raw inventory row |
| **Processed** | Processing run yield → processed inventory row (`processing_run_id` set) |
| **Wastage** | Processing run wastage → wastage inventory row |

Routes: `/inventory/raw`, `/inventory/processed`, `/inventory/wastage`.

Wastage sales are **not** implemented in Step 8.

## 12–13. Fresh and frozen

| Lifecycle | Rule |
| --- | --- |
| **Fresh** | `inventory_type` in (`raw`, `processed`) and `quantity > 0` (includes past cutoff until freeze runs) |
| **Frozen** | `inventory_type = frozen` (optional `frozen_at`) |
| **Wastage** | `inventory_type = wastage` (not freeze-eligible) |

Routes: `/inventory/fresh`, `/inventory/frozen`.

Fresh and frozen are lifecycle classes. Reserved / available remain independent.

Example: 100 kg frozen with 30 kg reserved → 70 kg available is valid.

## 14–16. Fresh → frozen rule

### Timestamp (deterministic)

| Inventory type | Origin timestamp |
| --- | --- |
| Raw | Parent `batches.received_at` |
| Processed | `inventory_items.created_at` (yield creation) |

Fresh window: **2 days** from origin (`src/lib/fresh-window.ts`).

### Eligibility

Eligible when:

- `quantity > 0`
- `inventory_type` is `raw` or `processed`
- origin + 2 days ≤ now

Not eligible: already `frozen`, `wastage`, zero quantity, or still inside the window.

### Transition

RPC / mock operation: `freeze_eligible_inventory` / `freezeEligibleInventory`

- Sets `inventory_type = frozen`
- Sets `frozen_at`
- Writes `fresh_to_frozen` movement with `previous_quantity = new_quantity` and `quantity = 0` (constraint allows zero only for this type)
- Writes audit `Inventory Frozen`
- **Does not** change `quantity` or `reserved_quantity`
- **Does not** release or delete allocations
- **Does not** change parent `batch_id` / batch number
- Idempotent: re-run freezes nothing already frozen

No background cron is shipped; the operation is safe for a future scheduler.

## 17. Inventory movements

Append-only `inventory_movements`. Types include:

`receipt`, `processing_consumption`, `processing_yield`, `processing_wastage`, `reservation`, `release`, `dispatch`, `fresh_to_frozen`, …

UI: `/inventory/movements` and batch detail history.

## 18–19. Traceability

```text
Customer PO
  → Fulfilment
  → Allocation
  → Inventory item
  → Parent batch (unchanged through freeze)
  → Processing run (when processed/wastage)
  → Goods receipt
  → Vendor
```

Batch detail (`/inventory/batches/[id]`) shows centralized balances, items, movements, and Step 7 customer usage.

## 20. Permissions

| Permission | Use |
| --- | --- |
| `inventory.view` | All inventory screens |
| `inventory.manage` | Freeze eligible inventory |

Roles follow `src/lib/permissions.ts` (warehouse staff/manager have manage; data entry view-only for inventory).

## 21. Audit

Lifecycle freeze writes `Inventory Frozen` with previous/new `inventory_type`, batch label, quantity metadata. Allocation / fulfilment audits remain Step 7’s responsibility. Page views are not audited.

## 22. Concurrency

Freeze RPC locks eligible inventory rows `FOR UPDATE`, re-checks eligibility, then updates. Step 7 allocation/dispatch lock order is unchanged.

## 23–24. Mock and Supabase modes

| Mode | Switch |
| --- | --- |
| Mock (default) | `SEADOCK_DATA_SOURCE` unset or `mock` |
| Supabase | `SEADOCK_DATA_SOURCE=supabase` + public keys |

Mock seed includes fulfilment stock (`inv_proc_0012` / `inv_proc_0018`) and lifecycle demo rows (`batch_lifecycle_001`, …).

## 25. Known limitations

- No wastage sales
- No arbitrary manual stock adjustment UI
- No scheduler / cron; freeze is on-demand (UI + service)
- Live Supabase end-to-end verification requires credentials (not present in default env)
- Step 10 mock E2E (`npm run verify:e2e`) exercises receive → process → freeze on dedicated receipts without relying on seed allocation state
- Supabase list filtering for search still loads inventory then filters in the service layer (acceptable for current volumes; not a second balance model)

## Routes

| Path | Purpose |
| --- | --- |
| `/inventory` | Overview + summary |
| `/inventory/raw` | Raw stock |
| `/inventory/processed` | Processed yield |
| `/inventory/fresh` | Fresh lifecycle |
| `/inventory/frozen` | Frozen lifecycle |
| `/inventory/wastage` | Wastage |
| `/inventory/movements` | Movement history |
| `/inventory/batches` | Parent batches |
| `/inventory/batches/[id]` | Batch detail + balances |
