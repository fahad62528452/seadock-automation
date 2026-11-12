# Processing workflow

This document describes the Step 4 operational chain implemented in SeaDock.

## Flow

```text
Parent Batch
     ↓
Processing Run
     ↓
Input
     ↓
Yield + Wastage
     ↓
Processing QAQC
     ↓
Raw Inventory Consumption
     ↓
Processed Inventory
     ↓
Wastage Inventory
```

Both processed yield and wastage remain linked to the **same Parent Batch**. No new batch numbers are created for yield or wastage.

## Reconciliation rule

```text
Input Quantity = Yield Quantity + Wastage Quantity
```

Quantities are compared at 3 decimal places (milli-units in application code; `numeric(14,3)` / `round(..., 3)` in PostgreSQL).

Yield % and Wastage % are derived for display:

```text
Yield %    = (Yield / Input) × 100
Wastage %  = (Wastage / Input) × 100
```

They are not stored as redundant columns.

## Status model

| Status | Meaning |
| --- | --- |
| Draft | Run saved without inventory impact |
| In Progress | Quantities being entered |
| Completed | Run finalized (QAQC recorded) |
| Cancelled | Run abandoned |

Inventory is created only when completion succeeds with QAQC **Passed** or **Conditional**.

## Failed QAQC

If processing QAQC is **Failed**:

- the processing run is preserved
- the QAQC record is preserved
- raw inventory is **not** consumed
- processed / wastage inventory is **not** created

## Transaction safety

Supabase mode uses:

```text
public.complete_processing_workflow(...)
```

In one PostgreSQL transaction it:

1. validates available raw inventory
2. validates Input = Yield + Wastage
3. creates/updates the processing run
4. creates processing QAQC
5. when accepted: consumes raw inventory, creates processed + wastage inventory, writes movements, updates batch remaining quantity
6. writes audit log rows

Mock mode mirrors the same rules in memory.

Draft creation uses `public.create_processing_run_draft(...)` and never mutates inventory.

## Inventory movements

| Movement type | Meaning |
| --- | --- |
| `processing_consumption` | Raw quantity reduced |
| `processing_yield` | Processed inventory created |
| `processing_wastage` | Wastage inventory created |

Movements are append-only.

## Run numbering

```text
RUN-YYYY-#####
```

Allocated by `public.next_processing_run_number()`.

## Routes

| Screen | Path |
| --- | --- |
| Processing list | `/processing` |
| New run | `/processing/new` |
| Run detail | `/processing/[id]` |

Aliases: `/processing/runs`, `/processing/yield`, `/processing/qaqc` → `/processing`

## Permissions

- `processing.view` — list/detail
- `processing.manage` — create drafts / enter data
- `processing.complete` — complete runs with inventory impact
- `processing.qaqc` — record processing QAQC on completion

## Audit events

- Processing Run Created
- Processing Run Updated
- Processing Run Completed
- Processing QAQC Created
- Raw Inventory Consumed
- Processed Inventory Created
- Wastage Inventory Created

## Intentionally not in Step 4

- Automatic fresh → frozen transfer
- Customer PO email ingestion
- Wastage sales / third-party dispatch
- Final dispatch QAQC
- Advanced reporting
