"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect, StatusBadge } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/purchases/actions";
import { formatQuantity, labelPurchaseOrderStatus } from "@/lib/procurement-labels";
import type { PurchaseOrderDetail } from "@/types/procurement";

const initialState: ActionState = { ok: false };

function toDateTimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ReceivingForm({
  action,
  purchaseOrders,
  canOverride,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  purchaseOrders: PurchaseOrderDetail[];
  canOverride: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [purchaseOrderId, setPurchaseOrderId] = useState(purchaseOrders[0]?.id ?? "");
  const selected = useMemo(
    () => purchaseOrders.find((po) => po.id === purchaseOrderId) ?? null,
    [purchaseOrderId, purchaseOrders],
  );
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}

      <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-[13px] text-ink-secondary">
        <p className="font-medium text-ink">Receiving → Incoming QAQC → Batch Creation</p>
        <p className="mt-1">
          Completing this form records the goods receipt, runs incoming QAQC, and creates the parent batch plus
          initial inventory when QAQC passes or is conditional.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Purchase Order" htmlFor="purchaseOrderId" required error={state.fieldErrors?.purchaseOrderId}>
          <FormSelect
            id="purchaseOrderId"
            name="purchaseOrderId"
            required
            value={purchaseOrderId}
            onChange={(event) => {
              setPurchaseOrderId(event.target.value);
              setQuantities({});
            }}
          >
            <option value="" disabled>
              Select purchase order
            </option>
            {purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.poNumber} — {po.vendorName} ({labelPurchaseOrderStatus(po.status)})
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Receipt Number" htmlFor="receiptNumber" required error={state.fieldErrors?.receiptNumber}>
          <FormInput id="receiptNumber" name="receiptNumber" required placeholder="GR-2026-001" />
        </FormField>
        <FormField label="Received Date / Time" htmlFor="receivedAt" required error={state.fieldErrors?.receivedAt}>
          <FormInput
            id="receivedAt"
            name="receivedAt"
            type="datetime-local"
            required
            defaultValue={toDateTimeLocalValue()}
          />
        </FormField>
        <FormField label="Driver Name" htmlFor="driverName" required error={state.fieldErrors?.driverName}>
          <FormInput id="driverName" name="driverName" required />
        </FormField>
        <FormField label="Vehicle Number" htmlFor="vehicleNumber" required error={state.fieldErrors?.vehicleNumber}>
          <FormInput id="vehicleNumber" name="vehicleNumber" required />
        </FormField>
      </div>

      <FormField label="Receiving Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" rows={3} />
      </FormField>

      <div className="space-y-3">
        <h3 className="text-[13px] font-semibold text-ink">Receiving Items</h3>
        {state.fieldErrors?.items ? <Alert tone="error">{state.fieldErrors.items}</Alert> : null}
        {!selected ? (
          <Alert tone="info">Select a purchase order to load outstanding items.</Alert>
        ) : (
          <>
            <input type="hidden" name="itemCount" value={selected.items.length} />
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                    <th className="px-3 py-2 font-medium">Product / Species</th>
                    <th className="px-3 py-2 font-medium">Ordered</th>
                    <th className="px-3 py-2 font-medium">Previously Received</th>
                    <th className="px-3 py-2 font-medium">Remaining</th>
                    <th className="px-3 py-2 font-medium">Receiving Now</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item, index) => (
                    <tr key={item.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        {item.productSpecies}
                        <input type="hidden" name={`items.${index}.purchaseOrderItemId`} value={item.id} />
                      </td>
                      <td className="px-3 py-2">{formatQuantity(item.orderedQuantity, item.unit)}</td>
                      <td className="px-3 py-2">{formatQuantity(item.receivedQuantity, item.unit)}</td>
                      <td className="px-3 py-2">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                      <td className="px-3 py-2">
                        <FormInput
                          name={`items.${index}.receivedQuantity`}
                          type="number"
                          min="0"
                          step="0.001"
                          value={quantities[item.id] ?? ""}
                          onChange={(event) =>
                            setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                          }
                          aria-label={`Receiving now for ${item.productSpecies}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <FormInput name={`items.${index}.unit`} defaultValue={item.unit} aria-label={`Unit for ${item.productSpecies}`} />
                        <input type="hidden" name={`items.${index}.notes`} value="" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-border p-4">
        <h3 className="text-[13px] font-semibold text-ink">Incoming QAQC</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Inspection Date" htmlFor="inspectionDate" required error={state.fieldErrors?.inspectionDate}>
            <FormInput
              id="inspectionDate"
              name="inspectionDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </FormField>
          <FormField label="Result" htmlFor="qaqcResult" required error={state.fieldErrors?.qaqcResult}>
            <FormSelect id="qaqcResult" name="qaqcResult" required defaultValue="passed">
              <option value="passed">Passed</option>
              <option value="conditional">Conditional</option>
              <option value="failed">Failed</option>
            </FormSelect>
          </FormField>
        </div>
        <FormField label="QAQC Notes" htmlFor="qaqcNotes">
          <FormArea id="qaqcNotes" name="qaqcNotes" rows={3} />
        </FormField>
        <p className="text-[12px] text-ink-muted">
          Inspector is recorded as the signed-in user. Failed QAQC stores the receipt without creating an accepted
          batch or inventory.
        </p>
      </div>

      {canOverride ? (
        <label className="flex items-start gap-2 text-[13px] text-ink-secondary">
          <input type="checkbox" name="allowOverReceive" className="mt-1" />
          <span>
            Allow receiving more than remaining ordered quantity
            <span className="mt-0.5 block text-[12px] text-ink-muted">
              Manager override. This creates an audit entry.
            </span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !selected}>
          {pending ? "Saving..." : "Complete Receiving"}
        </Button>
        <Link
          href="/purchases/goods-received"
          className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] text-ink-secondary hover:bg-surface-muted"
        >
          Cancel
        </Link>
        {selected ? <StatusBadge>{selected.poNumber}</StatusBadge> : null}
      </div>
    </form>
  );
}
