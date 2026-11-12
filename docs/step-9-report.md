# Step 9 report: Final QAQC and dispatch operations (warehouse UI)

Step 9 exposes Step 7 fulfilment, final QAQC and dispatch through a warehouse operations board and per-fulfilment workspace. No RPCs, allocation rules or database schema were changed.

## 1. Files created

| File | Purpose |
| --- | --- |
| `src/components/fulfilment/operational-board.tsx` | Shared bucket panels and operational table |
| `src/app/(shell)/fulfilment/page.tsx` | Fulfilment Operations board |
| `src/app/(shell)/fulfilment/[id]/page.tsx` | Fulfilment workspace (items, traceability, QAQC, dispatch) |
| `scripts/verify-fulfilment-ops-mock.mjs` | Step 9 mock checks (`npm run verify:fulfilment-ops`) |
| `docs/step-9-report.md` | This report |

## 2. Files modified

| File | Change |
| --- | --- |
| `src/types/fulfillment.ts` | `OperationalFulfilmentBoard`, `FulfilmentWorkspaceDetail`, traceability types |
| `src/lib/mock/fulfillment-store.ts` | `mockListOperationalFulfilments`, `mockGetFulfilmentWorkspace` |
| `src/services/fulfillment/fulfillment-service.ts` | `listOperationalFulfilments`, `getFulfilmentWorkspace` (mock + Supabase) |
| `src/app/(shell)/customer-orders/fulfillment-actions.ts` | Revalidate fulfilment paths; optional `returnTo` redirect |
| `src/components/customer-orders/fulfillment-forms.tsx` | Optional `returnTo` hidden field on QAQC, dispatch, cancel |
| `src/lib/navigation.ts` | Fulfilment Operations nav item; updated pending/fulfilled copy |
| `src/app/(shell)/orders/pending/page.tsx` | Redirect to `/fulfilment` |
| `src/app/(shell)/orders/fulfilled/page.tsx` | Redirect to `/fulfilment?bucket=completed` |
| `src/app/(shell)/qaqc/final/page.tsx` | Awaiting and blocked QAQC buckets from operations board |
| `docs/fulfillment-workflow.md` | Step 9 operational section |
| `docs/database-architecture.md` | Step 9 note (no schema change) |
| `package.json` | `verify:fulfilment-ops` script |

## 3. Operational buckets

| Bucket | Rule |
| --- | --- |
| `ready_for_fulfilment` | PO in allocatable status with active allocations not attached to a fulfilment |
| `awaiting_final_qaqc` | Fulfilment `draft`, not QAQC-blocked |
| `blocked_qaqc` | `draft`/`ready` with failed or on_hold final QAQC and `!canDispatch` |
| `ready_to_dispatch` | `ready` or `partially_dispatched` with `canDispatch` |
| `completed` | `dispatched` or `fulfilled` |

Cancelled fulfilments are omitted from the board.

## 4. Permissions (app layer)

| Role | `fulfill` | `qaqc` | `dispatch` |
| --- | --- | --- | --- |
| warehouse_staff | no | no | yes |
| warehouse_manager | yes | yes | yes |
| data_entry | no | no | no |

Enforced via `requirePermission` in `fulfillment-actions.ts`.

## 5. Routes

| Route | Behaviour |
| --- | --- |
| `/fulfilment` | Full operations board; `?bucket=completed` shows one section |
| `/fulfilment/[id]` | Workspace with forms reusing `FinalQaqcForm`, `DispatchForm`, `CancelFulfilmentForm` |
| `/customer-orders/[id]/fulfill` | Unchanged Step 7/8 allocation and fulfilment flow |
| `/qaqc/final` | QAQC-focused slice of the board |

## 6. Verification

- `npm run verify:fulfillment` — 18/18 Step 7 scenarios (allocate → QAQC → dispatch → inventory).
- `npm run verify:fulfilment-ops` — permissions, board bucketing, failed QAQC block, dispatch inventory effects, duplicate dispatch rejection, workspace batch identity.
- `npm run verify:inventory` — Step 8 inventory checks still pass.
- lint / tsc / db:validate / build — pass.
- Live Supabase E2E — not run (credentials not configured).

## 7. Architecture decision

**No redesign.** Step 9 is UI + read models on existing Step 7 RPCs (`record_final_qaqc`, `dispatch_fulfilment`, etc.). One corrective fix during review: Supabase operational queries now use real columns (`required_date`, `customers.customer_code`) instead of non-existent `customer_code` / `required_delivery_date` on the PO row.

## 8. Out of scope

Routing/GPS, customer portal, reports, wastage sales, Graph/OCR/AI, scheduled jobs, schema/RPC redesign.
