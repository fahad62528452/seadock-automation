"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/purchases/actions";
import type { VendorRecord } from "@/types/procurement";

const initialState: ActionState = { ok: false };

type Line = {
  productSpecies: string;
  orderedQuantity: string;
  unit: string;
  notes: string;
};

export function PurchaseOrderForm({
  action,
  vendors,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  vendors: VendorRecord[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [items, setItems] = useState<Line[]>([
    { productSpecies: "", orderedQuantity: "", unit: "kg", notes: "" },
  ]);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="itemCount" value={items.length} />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="PO Number" htmlFor="poNumber" required error={state.fieldErrors?.poNumber}>
          <FormInput id="poNumber" name="poNumber" required />
        </FormField>
        <FormField label="Vendor" htmlFor="vendorId" required error={state.fieldErrors?.vendorId}>
          <FormSelect id="vendorId" name="vendorId" required defaultValue="">
            <option value="" disabled>
              Select vendor
            </option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.vendorCode} — {vendor.vendorName}
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="PO Date" htmlFor="poDate" required error={state.fieldErrors?.poDate}>
          <FormInput id="poDate" name="poDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </FormField>
        <FormField label="Expected Date" htmlFor="expectedDate">
          <FormInput id="expectedDate" name="expectedDate" type="date" />
        </FormField>
        <FormField label="Status" htmlFor="status">
          <FormSelect id="status" name="status" defaultValue="issued">
            <option value="issued">Issued</option>
            <option value="draft">Draft</option>
          </FormSelect>
        </FormField>
      </div>

      <FormField label="Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" rows={3} />
      </FormField>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink">PO Items</h3>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setItems((current) => [...current, { productSpecies: "", orderedQuantity: "", unit: "kg", notes: "" }])
            }
          >
            + Add Item
          </Button>
        </div>
        {state.fieldErrors?.items ? <Alert tone="error">{state.fieldErrors.items}</Alert> : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <th className="px-3 py-2 font-medium">Product / Species</th>
                <th className="px-3 py-2 font-medium">Ordered Quantity</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.productSpecies`}
                      value={item.productSpecies}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productSpecies: event.target.value } : row,
                          ),
                        )
                      }
                      aria-label={`Product species ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.orderedQuantity`}
                      type="number"
                      min="0"
                      step="0.001"
                      value={item.orderedQuantity}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, orderedQuantity: event.target.value } : row,
                          ),
                        )
                      }
                      aria-label={`Ordered quantity ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.unit`}
                      value={item.unit}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, unit: event.target.value } : row,
                          ),
                        )
                      }
                      aria-label={`Unit ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.notes`}
                      value={item.notes}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, notes: event.target.value } : row,
                          ),
                        )
                      }
                      aria-label={`Notes ${index + 1}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() => setItems((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || vendors.length === 0}>
          {pending ? "Saving..." : "Create Purchase Order"}
        </Button>
        <Link
          href="/purchases/orders"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] text-ink-secondary hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
      {vendors.length === 0 ? <Alert tone="error">Create a vendor before issuing a purchase order.</Alert> : null}
    </form>
  );
}
