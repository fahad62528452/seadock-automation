"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/purchases/actions";
import type { VendorRecord } from "@/types/procurement";

const initialState: ActionState = { ok: false };

export function VendorForm({
  action,
  vendor,
  submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  vendor?: VendorRecord;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Vendor Code" htmlFor="vendorCode" required error={state.fieldErrors?.vendorCode}>
          <FormInput id="vendorCode" name="vendorCode" defaultValue={vendor?.vendorCode ?? ""} required />
        </FormField>
        <FormField label="Vendor Name" htmlFor="vendorName" required error={state.fieldErrors?.vendorName}>
          <FormInput id="vendorName" name="vendorName" defaultValue={vendor?.vendorName ?? ""} required />
        </FormField>
        <FormField label="Contact Person" htmlFor="contactPerson">
          <FormInput id="contactPerson" name="contactPerson" defaultValue={vendor?.contactPerson ?? ""} />
        </FormField>
        <FormField label="Phone" htmlFor="phone">
          <FormInput id="phone" name="phone" defaultValue={vendor?.phone ?? ""} />
        </FormField>
        <FormField label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <FormInput id="email" name="email" type="email" defaultValue={vendor?.email ?? ""} />
        </FormField>
        <FormField label="Status" htmlFor="status" required error={state.fieldErrors?.status}>
          <FormSelect id="status" name="status" defaultValue={vendor?.status ?? "active"} required>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </FormSelect>
        </FormField>
      </div>

      <FormField label="Address" htmlFor="address">
        <FormArea id="address" name="address" defaultValue={vendor?.address ?? ""} rows={3} />
      </FormField>
      <FormField label="Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" defaultValue={vendor?.notes ?? ""} rows={3} />
      </FormField>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : submitLabel}
        </Button>
        <Link
          href={vendor ? `/purchases/vendors/${vendor.id}` : "/purchases/vendors"}
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] text-ink-secondary hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
