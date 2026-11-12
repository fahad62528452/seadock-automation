# Customer Purchase Order workflow

Step 5 establishes the **Customer PO core**. Step 6 adds email intake into that same core. Fulfilment remains future work.

## Core flow (Layer A)

```text
Customer
  ↓
Customer PO
  ↓
PO Items
  ↓
Status / Action Required
  ↓
Future Fulfillment
```

Operators can still create customers and customer POs manually without email.

## Email intake flow (Layer B — Step 6)

```text
Email
  ↓
PO Candidate
  ↓
Review
  ↓
Customer PO
```

Extracted email drafts are never auto-approved. Confirmation uses `CustomerOrderService` with `source=email`. See `docs/email-po-ingestion.md`.

## Status model

| Status | Meaning in Step 5 |
| --- | --- |
| Received | PO intake recorded |
| Under Review | Operator reviewing contents |
| Action Required | Explicit human attention needed |
| Approved | Ready for later allocation/fulfilment |
| Partially Allocated | Reserved for future fulfilment work |
| Ready for Fulfillment | Reserved for future fulfilment work |
| Fulfilled | Reserved for future fulfilment work |
| Cancelled | Abandoned |

Step 5 does **not** implement allocation, dispatch, or fulfilment.

## Priority

- `normal`
- `high`
- `urgent`

Priority is shown as text badges (NORMAL / HIGH / URGENT) with restrained visual emphasis.

## Action Required

Operators can explicitly mark a PO as action required and must provide a reason. The reason is stored on the PO and surfaced on the detail page and dashboard.

## Duplicate protection

Database uniqueness:

```text
(customer_id, po_number)
```

Creating the same PO number for the same customer is rejected.

## Transactional create

Supabase mode uses:

```text
public.create_customer_purchase_order(...)
```

In one transaction it creates:

1. customer PO header
2. PO items
3. initial status history row
4. audit log entries

Mock mode mirrors the same business rules.

Status changes use:

```text
public.change_customer_purchase_order_status(...)
```

and write to `customer_purchase_order_status_history` plus `audit_logs`.

## Traceability foundation

Future fulfilment can reference:

- `customer_purchase_order_id`
- `customer_purchase_order_item_id`
- `batch_id`
- `inventory_item_id`

Existing `fulfilments` / `fulfilment_items` already preserve those relationships. Step 5 does not create fake allocations.

## Email architecture (Layer B)

```text
Gmail / Microsoft 365 / other
        ↓
EmailProvider (replaceable)
        ↓
Common Email Ingestion
        ↓
PO Detection / Extraction
        ↓
Human Review
        ↓
Customer PO Service
```

Step 6 implements Gmail + mock providers, sync, detection, heuristic extraction, and review. Microsoft Graph, OCR, and AI extractors remain future plugs behind the same interfaces.

## Routes

| Screen | Path |
| --- | --- |
| Customer PO list | `/customer-orders` |
| Create PO | `/customer-orders/new` |
| PO detail | `/customer-orders/[id]` |
| Email PO inbox | `/customer-orders/inbox` |
| Email PO review | `/customer-orders/inbox/[id]` |
| Email settings | `/settings/email` |
| Customers | `/customers` |
| Create customer | `/customers/new` |
| Customer detail | `/customers/[id]` |

Aliases: `/orders/customer-pos` → `/customer-orders`; `/inbox` → `/customer-orders/inbox`

## Permissions

- `customer_orders.view`
- `customer_orders.create`
- `customer_orders.manage`
- `customer_orders.status`
- `customer_orders.email_review`
- `email.view`
- `email.manage`

## Source field

`manual` | `email` | `api` | `import`

Manual UI create uses `manual`. Confirmed email intake writes `email`.
