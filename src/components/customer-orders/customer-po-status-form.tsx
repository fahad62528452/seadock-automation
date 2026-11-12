"use client";

import { useActionState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/customer-orders/actions";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";

const initialState: ActionState = { ok: false };

const NEXT_STATUSES = [
  "received",
  "under_review",
  "action_required",
  "approved",
  "ready_for_fulfillment",
  "cancelled",
] as const;

export function CustomerPoStatusForm({
  action,
  currentStatus,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  currentStatus: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4 p-4">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <FormField label="New Status" htmlFor="toStatus" required>
        <FormSelect id="toStatus" name="toStatus" defaultValue={currentStatus === "received" ? "under_review" : currentStatus}>
          {NEXT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {labelCustomerPoStatus(status)}
            </option>
          ))}
        </FormSelect>
      </FormField>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input type="checkbox" name="markActionRequired" className="rounded border-border" />
        Mark as Action Required
      </label>
      <FormField label="Action Required Reason" htmlFor="actionRequiredReason" hint="Required when marking action required.">
        <FormInput id="actionRequiredReason" name="actionRequiredReason" />
      </FormField>
      <FormField label="Reason" htmlFor="reason">
        <FormInput id="reason" name="reason" />
      </FormField>
      <FormField label="Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" rows={2} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Update Status"}
      </Button>
    </form>
  );
}
