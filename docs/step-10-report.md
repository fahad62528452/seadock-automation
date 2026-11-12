# Step 10 report: End-to-end mock verification

Step 10 adds a single cross-module mock verification script that walks procurement → processing → customer PO → allocation → fulfilment → final QAQC → dispatch, plus lifecycle freeze and permission checks. **No application UI, RPC, or schema changes** (one read-model tweak: fulfillment audit list now exposes `entityType` / `entityId`).

## 1. Files created

| File | Purpose |
| --- | --- |
| `scripts/verify-e2e-mock.mjs` | Scenarios A–J + idempotency checks (`npm run verify:e2e`) |
| `docs/step-10-report.md` | This report |

## 2. Files modified

| File | Change |
| --- | --- |
| `src/lib/mock/fulfillment-store.ts` | `mockListFulfillmentAudits` returns `entityType`, `entityId`, `entityLabel` |
| `package.json` | `verify:e2e` script |
| `docs/database-architecture.md` | Step 10 note |
| `docs/fulfillment-workflow.md` | E2E validation pointer |
| `docs/inventory-operations.md` | E2E validation pointer |

## 3. Scenario map (A–J)

| Scenario | Coverage |
| --- | --- |
| A | Normal fresh order: vendor → PO → receive → process → customer PO → allocate → fulfil → QAQC → full dispatch; batch traceability |
| B | Incoming QAQC **failed**: receipt rejected, no batch/inventory |
| C | Processing reconciliation (`input = yield + wastage`, decimals) |
| D | Multi-batch allocation and single fulfilment dispatch |
| E | Partial dispatch (40 + 60) → `partially_fulfilled` then `fulfilled` |
| F | Final QAQC failed blocks dispatch; pass enables retry |
| G | Fresh → frozen on dedicated old receipt; idempotent second freeze |
| H | Customer PO cancel releases reserved quantity |
| I | `hasPermission` matrix (`permissions.ts`, app layer) |
| J | `mockListFulfillmentAudits` allocate / fulfil / QAQC / dispatch chain |

Additional checks: duplicate receipt number, duplicate processing completion, dispatch after fulfilled, freeze movement idempotency (G).

## 4. Architecture authority

| Layer | Mock entry points |
| --- | --- |
| Receiving | `mockCompleteReceiving` |
| Processing | `mockCompleteProcessing` |
| Customer | `mockCreateCustomer`, `mockCreateCustomerPurchaseOrder`, `mockChangeCustomerPoStatus` |
| Allocation / fulfilment / QAQC / dispatch / cancel | `fulfillment-store` mocks |
| Freeze | `mockFreezeEligibleInventory` |
| Permissions | `hasPermission` in `src/lib/permissions.ts` (documented; not RPC-enforced in mock) |

Procurement audit history is not exported on `getMockInventoryContext()`; receiving/processing outcomes and goods-receipt detail are asserted instead. Fulfilment audits use `mockListFulfillmentAudits`.

## 5. Isolation

E2E entities use unique vendor codes, procurement PO numbers, receipt numbers, and customer PO numbers (`PO-E2E-*`, `GR-E2E-*`, `CPO-E2E-*`) so `verify:fulfillment` seed IDs (`cpo_seed_1001`, `inv_proc_0012`, …) remain valid when scripts run in sequence.

## 6. Concurrency

Live concurrent sessions are **not** run (Supabase not configured). The script documents that mock mode validates sequential semantics (e.g. over-allocation rejection) only.

## 7. Verification

Run:

```bash
npm run verify:e2e
npm run verify:fulfillment
npm run verify:fulfilment-ops
npm run verify:inventory
npx tsc --noEmit
```

Live Supabase E2E — not run (credentials not configured).

## 8. Known limitations

- **Live Supabase E2E not run** — environment credentials not configured.
- **Live concurrency** not exercised; Step 7 RPCs use `FOR UPDATE` + ordered locks (documented, not re-tested against Postgres here).
- **Permissions** verified via centralized `hasPermission` map; RPC boundary remains authenticated/`security definer` as in Steps 7–9 (app `requirePermission` is the operational gate).
- **Duplicate processing completion** may report “cannot exceed available batch inventory” when raw stock was already consumed, before “already completed”, because mock and SQL check raw availability before run status. Rejection remains safe (no double consumption).
- Intentional **request-time rendering** remains on time-sensitive inventory pages (`await connection()`).

## 9. Out of scope

UI feature expansion, new RPCs, schema migrations, live concurrency harness, Graph/OCR/email automation.
