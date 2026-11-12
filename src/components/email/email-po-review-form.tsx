"use client";

import { useActionState, type ReactNode } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { InboxActionState } from "@/app/(shell)/customer-orders/inbox/actions";
import type { EmailPoCandidateDetail } from "@/types/email";
import type { CustomerRecord } from "@/types/customer-orders";

const initialState: InboxActionState = { ok: true };

function FieldReview({
  label,
  extracted,
  warning,
  children,
}: {
  label: string;
  extracted: string;
  warning?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border py-3 md:grid-cols-[12rem_1fr_1.2fr]">
      <div className="text-[12px] font-medium text-ink">{label}</div>
      <div className="text-[13px] text-ink-secondary">
        <div>{extracted || "—"}</div>
        {warning ? <div className="mt-1 text-[12px] text-warning">⚠ {warning}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function EmailPoReviewForm({
  candidate,
  customers,
  confirmAction,
  ignoreAction,
  actionRequiredAction,
  retryAction,
}: {
  candidate: EmailPoCandidateDetail;
  customers: CustomerRecord[];
  confirmAction: (prev: InboxActionState, formData: FormData) => Promise<InboxActionState>;
  ignoreAction: (prev: InboxActionState, formData: FormData) => Promise<InboxActionState>;
  actionRequiredAction: (prev: InboxActionState, formData: FormData) => Promise<InboxActionState>;
  retryAction: () => Promise<InboxActionState>;
}) {
  const [confirmState, confirmFormAction, confirming] = useActionState(confirmAction, initialState);
  const [ignoreState, ignoreFormAction, ignoring] = useActionState(ignoreAction, initialState);
  const [actionState, actionFormAction, marking] = useActionState(actionRequiredAction, initialState);
  const extracted = candidate.extractedPayload;
  const lines = extracted?.lineItems?.length
    ? extracted.lineItems
    : [
        {
          productName: { value: null, warning: "Verify product" },
          species: { value: null },
          productCode: { value: null },
          quantity: { value: null, warning: "Verify quantity" },
          unit: { value: "kg" },
          requiredDeliveryDate: { value: null },
          specifications: { value: null },
          notes: { value: null },
        },
      ];

  const blocked =
    candidate.reviewStatus === "confirmed" ||
    Boolean(candidate.duplicatePoId || candidate.duplicatePoNumber);

  return (
    <div className="space-y-5">
      {!confirmState.ok && confirmState.message ? <Alert tone="error">{confirmState.message}</Alert> : null}
      {!ignoreState.ok && ignoreState.message ? <Alert tone="error">{ignoreState.message}</Alert> : null}
      {!actionState.ok && actionState.message ? <Alert tone="error">{actionState.message}</Alert> : null}
      {actionState.ok && actionState.message ? <Alert tone="success">{actionState.message}</Alert> : null}

      {candidate.duplicatePoNumber ? (
        <Alert tone="error">
          Possible duplicate PO. Existing PO: {candidate.duplicatePoNumber}. Do not create another
          approved PO from this email.
        </Alert>
      ) : null}

      <form action={confirmFormAction} className="space-y-4">
        <input type="hidden" name="itemCount" value={lines.length} />
        <input
          type="hidden"
          name="receivedAt"
          value={
            candidate.email.receivedAt?.slice(0, 10) ||
            new Date().toISOString().slice(0, 10)
          }
        />

        <FieldReview
          label="PO Number"
          extracted={extracted?.poNumber.value ?? ""}
          warning={extracted?.poNumber.warning}
        >
          <FormField label="Editable value" htmlFor="poNumber" required>
            <FormInput
              id="poNumber"
              name="poNumber"
              defaultValue={extracted?.poNumber.value ?? ""}
              required
              disabled={blocked}
            />
          </FormField>
        </FieldReview>

        <FieldReview
          label="Customer"
          extracted={
            candidate.matchedCustomerName
              ? `${candidate.matchedCustomerName}${candidate.matchedCustomerCode ? ` (${candidate.matchedCustomerCode})` : ""}`
              : extracted?.customerName.value ?? ""
          }
          warning={
            candidate.customerMatchStatus !== "matched"
              ? "Customer could not be confidently identified."
              : extracted?.customerName.warning
          }
        >
          <FormField label="Editable customer" htmlFor="customerId" required>
            <FormSelect
              id="customerId"
              name="customerId"
              defaultValue={candidate.matchedCustomerId ?? ""}
              required
              disabled={blocked}
            >
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.customerCode})
                </option>
              ))}
            </FormSelect>
          </FormField>
        </FieldReview>

        <FieldReview label="PO Date" extracted={extracted?.poDate.value ?? ""}>
          <FormField label="Editable value" htmlFor="poDate" required>
            <FormInput
              id="poDate"
              name="poDate"
              type="date"
              defaultValue={extracted?.poDate.value ?? new Date().toISOString().slice(0, 10)}
              required
              disabled={blocked}
            />
          </FormField>
        </FieldReview>

        <FieldReview
          label="Required Delivery"
          extracted={extracted?.requiredDeliveryDate.value ?? ""}
          warning={extracted?.requiredDeliveryDate.warning ?? (extracted?.requiredDeliveryDate.value ? null : "Required")}
        >
          <FormField label="Editable value" htmlFor="requiredDeliveryDate" required>
            <FormInput
              id="requiredDeliveryDate"
              name="requiredDeliveryDate"
              type="date"
              defaultValue={extracted?.requiredDeliveryDate.value ?? ""}
              required
              disabled={blocked}
            />
          </FormField>
        </FieldReview>

        <FieldReview label="Priority" extracted={extracted?.priority.value ?? "normal"}>
          <FormField label="Editable value" htmlFor="priority">
            <FormSelect
              id="priority"
              name="priority"
              defaultValue={extracted?.priority.value ?? "normal"}
              disabled={blocked}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </FormSelect>
          </FormField>
        </FieldReview>

        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-ink">Line items</h3>
          {lines.map((line, index) => (
            <div key={index} className="rounded-md border border-border p-3">
              <FieldReview
                label={`Quantity (line ${index + 1})`}
                extracted={
                  line.quantity.value != null
                    ? `${line.quantity.value} ${line.unit.value ?? "kg"}`
                    : ""
                }
                warning={line.quantity.warning}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <FormField label="Product" htmlFor={`product-${index}`} required>
                    <FormInput
                      id={`product-${index}`}
                      name={`items.${index}.productName`}
                      defaultValue={line.productName.value ?? ""}
                      required
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Species" htmlFor={`species-${index}`}>
                    <FormInput
                      id={`species-${index}`}
                      name={`items.${index}.species`}
                      defaultValue={line.species.value ?? line.productName.value ?? ""}
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Product code" htmlFor={`code-${index}`}>
                    <FormInput
                      id={`code-${index}`}
                      name={`items.${index}.productCode`}
                      defaultValue={line.productCode.value ?? ""}
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Quantity" htmlFor={`qty-${index}`} required>
                    <FormInput
                      id={`qty-${index}`}
                      name={`items.${index}.quantity`}
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={line.quantity.value ?? ""}
                      required
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Unit" htmlFor={`unit-${index}`}>
                    <FormInput
                      id={`unit-${index}`}
                      name={`items.${index}.unit`}
                      defaultValue={line.unit.value ?? "kg"}
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Line delivery" htmlFor={`line-delivery-${index}`}>
                    <FormInput
                      id={`line-delivery-${index}`}
                      name={`items.${index}.requiredDeliveryDate`}
                      type="date"
                      defaultValue={
                        line.requiredDeliveryDate.value ??
                        extracted?.requiredDeliveryDate.value ??
                        ""
                      }
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Specifications" htmlFor={`spec-${index}`}>
                    <FormInput
                      id={`spec-${index}`}
                      name={`items.${index}.specifications`}
                      defaultValue={line.specifications.value ?? ""}
                      disabled={blocked}
                    />
                  </FormField>
                  <FormField label="Notes" htmlFor={`notes-${index}`}>
                    <FormInput
                      id={`notes-${index}`}
                      name={`items.${index}.notes`}
                      defaultValue={line.notes.value ?? ""}
                      disabled={blocked}
                    />
                  </FormField>
                </div>
              </FieldReview>
            </div>
          ))}
        </div>

        <FormField label="Notes" htmlFor="notes">
          <FormArea id="notes" name="notes" rows={3} defaultValue="" disabled={blocked} />
        </FormField>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={blocked || confirming}>
            {confirming ? "Confirming…" : "Edit & Confirm PO"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={candidate.reviewStatus === "confirmed"}
            onClick={async () => {
              await retryAction();
              window.location.reload();
            }}
          >
            Retry Extraction
          </Button>
        </div>
        {blocked && !candidate.duplicatePoNumber ? (
          <p className="text-[12px] text-ink-muted">This candidate is already confirmed.</p>
        ) : null}
      </form>

      <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
        <form action={actionFormAction} className="space-y-2">
          <FormField label="Mark action required" htmlFor="action-reason">
            <FormSelect id="action-reason" name="reason" defaultValue="manual_review_required">
              <option value="manual_review_required">Manual review required</option>
              <option value="customer_not_found">Customer not found</option>
              <option value="duplicate_po">Duplicate PO</option>
              <option value="missing_po_number">Missing PO number</option>
              <option value="missing_quantity">Missing quantity</option>
              <option value="missing_delivery_date">Missing delivery date</option>
              <option value="unsupported_attachment">Unsupported attachment</option>
              <option value="extraction_failed">Extraction failed</option>
              <option value="ambiguous_extraction">Ambiguous extraction</option>
            </FormSelect>
          </FormField>
          <Button type="submit" variant="secondary" disabled={marking || candidate.reviewStatus === "confirmed"}>
            Mark Action Required
          </Button>
        </form>

        <form action={ignoreFormAction} className="space-y-2">
          <FormField label="Ignore reason" htmlFor="ignore-reason">
            <FormInput id="ignore-reason" name="reason" placeholder="Not a customer PO" />
          </FormField>
          <Button type="submit" variant="danger" disabled={ignoring || candidate.reviewStatus === "confirmed"}>
            Ignore
          </Button>
        </form>
      </div>
    </div>
  );
}
