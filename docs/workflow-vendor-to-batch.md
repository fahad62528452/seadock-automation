# Vendor → Parent Batch workflow

This document describes the Step 3 operational chain implemented in SeaDock.

## Flow

```text
Vendor
  ↓
Purchase Order (+ Purchase Order Items)
  ↓
Goods Receipt (+ Goods Receipt Items, Driver, Vehicle)
  ↓
Incoming QAQC
  ↓
Parent Batch   ← batch number becomes the traceability identity
  ↓
Initial Inventory Item (raw / unprocessed)
  ↓
Inventory Movement (RECEIPT: 0 → received quantity)
```

## Where the batch number is born

The parent batch is created only after Incoming QAQC is completed with:

- `passed`, or
- `conditional`

A `failed` QAQC still stores the goods receipt and QAQC result, but does **not** create an accepted batch or inventory.

Batch numbers are generated as:

```text
BATCH-{YYYY}-{#####}
```

using `public.next_batch_number()` / the mock counter. The number is unique and human-readable.

From this point forward, downstream processing, wastage, frozen stock, customer fulfilment, and final QAQC must reference this same parent batch. Do not invent a second batch identity for processed or frozen stock.

## Transaction safety

In Supabase mode, receiving completion runs through the PostgreSQL function:

```text
public.complete_receiving_workflow(...)
```

That function writes, in one database transaction:

1. goods receipt + items
2. incoming QAQC
3. parent batch(es) when accepted
4. inventory item(s)
5. inventory movement(s)
6. audit log rows
7. purchase order status update

If any step fails, the whole operation rolls back.

Mock mode mirrors the same logical sequence in memory.

## Fresh window (visibility only)

UI calculates:

```text
Fresh Until = Received At + 2 days
```

Statuses:

- Fresh
- Approaching Deadline
- Expired / Ready for Frozen

No automatic frozen transfer is performed in Step 3.

## Routes

| Screen | Path |
| --- | --- |
| Vendors | `/purchases/vendors` |
| Create vendor | `/purchases/vendors/new` |
| Vendor detail/edit | `/purchases/vendors/[id]` · `/purchases/vendors/[id]/edit` |
| Purchase orders | `/purchases/orders` |
| Create PO | `/purchases/orders/new` |
| PO detail | `/purchases/orders/[id]` |
| Goods received | `/purchases/goods-received` |
| Receive goods | `/purchases/goods-received/new` |
| Receipt detail | `/purchases/goods-received/[id]` |
| Batches | `/inventory/batches` |
| Batch detail | `/inventory/batches/[id]` |

Aliases:

- `/vendors` → `/purchases/vendors`
- `/purchases/purchase-orders` → `/purchases/orders`

## Permissions

Uses the existing permission map:

- View lists/details: `purchases.view`, `inventory.view`, `qaqc.view`
- Create/edit vendors, POs, receiving: `purchases.manage`
- Completing receiving also requires `qaqc.manage`
- Over-receive override: Super Admin, Manager, Warehouse Manager only (audited)

## Audit events

- Vendor Created / Vendor Updated
- PO Created / PO Status Changed
- Goods Receipt Created
- Incoming QAQC Created
- Batch Created
- Initial Inventory Created
- Inventory Receipt Recorded
- Goods Receipt Over-Receive Override (when used)
