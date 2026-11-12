"use client";

import { useActionState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/customer-orders/actions";
import type { CustomerRecord } from "@/types/customer-orders";

const initialState: ActionState = { ok: false };

export function CustomerForm({
  action,
  customer,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customer?: CustomerRecord;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Customer Code" htmlFor="customerCode" required error={state.fieldErrors?.customerCode}>
          <FormInput
            id="customerCode"
            name="customerCode"
            required
            defaultValue={customer?.customerCode ?? ""}
            placeholder="CUST-00001"
          />
        </FormField>
        <FormField label="Customer Name" htmlFor="name" required error={state.fieldErrors?.name}>
          <FormInput id="name" name="name" required defaultValue={customer?.name ?? ""} />
        </FormField>
        <FormField label="Contact Person" htmlFor="contactPerson">
          <FormInput id="contactPerson" name="contactPerson" defaultValue={customer?.contactPerson ?? ""} />
        </FormField>
        <FormField label="Phone" htmlFor="phone">
          <FormInput id="phone" name="phone" defaultValue={customer?.phone ?? ""} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <FormInput id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </FormField>
        <FormField label="Status" htmlFor="status" required error={state.fieldErrors?.status}>
          <FormSelect id="status" name="status" defaultValue={customer?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </FormSelect>
        </FormField>
      </div>
      <FormField label="Address" htmlFor="address">
        <FormArea id="address" name="address" rows={2} defaultValue={customer?.address ?? ""} />
      </FormField>
      <FormField label="Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" rows={3} defaultValue={customer?.notes ?? ""} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
