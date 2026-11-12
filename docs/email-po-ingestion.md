# Email PO ingestion (Step 6)

Step 6 adds the first real customer PO email intake pipeline. Extracted candidates always require human confirmation. Extracted ≠ approved.

## End-to-end flow

```text
Customer Email
      ↓
Gmail Provider / Mock Provider
      ↓
Email Message
      ↓
email_messages (idempotent)
      ↓
PO Detection
      ↓
PO Extraction (heuristic text)
      ↓
email_po_candidates (review)
      ↓
Human Confirmation
      ↓
CustomerOrderService → Customer PO
```

## Gmail OAuth

Server-side OAuth only:

1. Admin opens `/settings/email` and chooses **Connect Gmail**.
2. Browser redirects to Google consent with `gmail.readonly` + email scopes.
3. Callback `/api/email/gmail/callback` exchanges the code server-side.
4. Access/refresh tokens are encrypted with `EMAIL_CREDENTIALS_ENCRYPTION_KEY` (AES-256-GCM) and stored in `email_provider_connections` as ciphertext.
5. Tokens are never returned to React state, localStorage, sessionStorage, or audit logs.

Environment (see `.env.example`):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:3000/api/email/gmail/callback`)
- `EMAIL_CREDENTIALS_ENCRYPTION_KEY`

In `SEADOCK_DATA_SOURCE=mock`, **Connect Mock Inbox** uses the deterministic mock mailbox instead of Google.

## Provider architecture

```text
UI / server actions
      ↓
Email intake / connection services
      ↓
EmailProvider (interface)
      ↓
GmailEmailProvider | MockEmailProvider | UnconfiguredEmailProvider
```

The application never imports Gmail API types into React components.

## Message ingestion + idempotency

`Sync Now`:

1. Lists inbox messages from the active provider
2. For each message, checks uniqueness on `(provider, external_message_id)`
3. Inserts only new rows into `email_messages`
4. Stores attachment metadata in `email_attachments`
5. Runs PO detection + heuristic extraction for candidates
6. Persists `email_po_candidates`
7. Writes sync summary onto the provider connection

Re-running sync is safe: already-seen messages are skipped.

## PO detection

`detectPurchaseOrderCandidate` scores subject, body, snippet, attachments, and urgency language.

Labels:

- `likely_po`
- `needs_review`
- `not_po` (ignored; no candidate)

Detection never creates an approved Customer PO.

## Extraction

Provider-neutral interface:

```ts
interface PurchaseOrderExtractor {
  extract(input): Promise<PurchaseOrderExtractionResult>
}
```

Step 6 implements `HeuristicPurchaseOrderExtractor` only (subject/body/text-like attachment content).

Intentionally deferred:

- OCR provider integration
- AI model extraction
- PDF binary parsing beyond metadata

Unsupported attachments are recorded and raise `unsupported_attachment` action-required reasons.

## Review → Customer PO

Routes:

- `/customer-orders/inbox`
- `/customer-orders/inbox/[id]`
- `/settings/email`
- `/inbox` → redirects to inbox

Operators edit extracted values, then confirm. Confirmation calls existing `createCustomerPurchaseOrder` with `source: "email"`. Duplicate `(customer, po_number)` blocks creation.

On success:

- `email_po_candidates.linked_customer_po_id`
- `email_messages.linked_customer_po_id`
- email processing status → `processed`

## Security

- OAuth secrets and refresh tokens stay server-side
- Ciphertext only in DB
- Attachments are private metadata; no public URLs
- Permissions validated in server actions
- Client-submitted customer / status values are re-validated by CustomerOrderService

## Permissions

| Permission | Purpose |
| --- | --- |
| `email.view` | View connection status / test |
| `email.manage` | Connect, disconnect, sync |
| `customer_orders.email_review` | Review / confirm / ignore candidates |

Warehouse staff do not receive email credential management.

## Audit events

- Gmail Connected
- Gmail Disconnected
- Email Sync Started
- Email Sync Completed
- Email Message Received
- PO Candidate Detected
- PO Extraction Started
- PO Extraction Completed
- PO Extraction Failed
- PO Marked Action Required
- Customer PO Created From Email
- Duplicate PO Detected
- Email PO Ignored

## Future work

- Microsoft Graph provider
- OCR / AI extractors behind `PurchaseOrderExtractor`
- Background polling
- Attachment binary storage linkage to Customer PO documents
- Automatic approval rules (explicit business policy only)
- Fulfilment / allocation after confirmed Customer PO
