"use client";

import { useActionState, useState } from "react";
import type { FulfillmentActionState } from "@/app/(shell)/customer-orders/fulfillment-actions";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import { labelInventoryType } from "@/lib/fulfillment-labels";
import { formatQuantity } from "@/lib/procurement-labels";
import { quantityGreaterThan, roundQuantity } from "@/lib/quantity";
import type {
  AllocationRecord,
  AvailableInventoryOption,
  FulfilmentItemRecord,
} from "@/types/fulfillment";

type FulfillmentAction = (
  prev: FulfillmentActionState,
  formData: FormData,
) => Promise<FulfillmentActionState>;

const initialState: FulfillmentActionState = { ok: false };

function ErrorAlert({ state }: { state: FulfillmentActionState }) {
  return state.message ? <Alert tone="error">{state.message}</Alert> : null;
}

const thClass = "px-4 py-2 font-medium";

export function AllocationForm({
  action,
  options,
  unallocatedQuantity,
  unit,
}: {
  action: FulfillmentAction;
  options: AvailableInventoryOption[];
  unallocatedQuantity: number;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [values, setValues] = useState<Record<string, string>>({});

  const total = roundQuantity(
    Object.values(values).reduce((sum, value) => sum + (Number(value) > 0 ? Number(value) : 0), 0),
  );
  const overPo = quantityGreaterThan(total, unallocatedQuantity);
  const overStock = options.some((option) => {
    const entered = Number(values[option.inventoryItemId] ?? 0);
    return entered > 0 && quantityGreaterThan(entered, option.availableQuantity);
  });

  return (
    <form action={formAction} className="space-y-3 p-4">
      <ErrorAlert state={state} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
            <tr>
              <th className={thClass}>Batch</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Total</th>
              <th className={thClass}>Reserved</th>
              <th className={thClass}>Available</th>
              <th className={thClass}>Allocate ({unit})</th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr key={option.inventoryItemId} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <div className="font-medium">{option.batchNumber}</div>
                  {option.processingRunNumber ? (
                    <div className="text-[12px] text-ink-muted">{option.processingRunNumber}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2">{labelInventoryType(option.inventoryType)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(option.totalQuantity, option.unit)}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(option.reservedQuantity, option.unit)}</td>
                <td className="px-4 py-2 font-medium whitespace-nowrap">
                  {formatQuantity(option.availableQuantity, option.unit)}
                </td>
                <td className="px-4 py-2">
                  <FormInput
                    type="number"
                    name={`qty_${option.inventoryItemId}`}
                    min={0}
                    max={option.availableQuantity}
                    step="0.001"
                    inputMode="decimal"
                    aria-label={`Allocate from ${option.batchNumber}`}
                    value={values[option.inventoryItemId] ?? ""}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [option.inventoryItemId]: event.target.value }))
                    }
                    className="w-32"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || total <= 0 || overPo || overStock}>
          {pending ? "Allocating…" : "Allocate Inventory"}
        </Button>
        <p className="text-[12px] text-ink-muted">
          Allocating {formatQuantity(total, unit)} of {formatQuantity(unallocatedQuantity, unit)} unallocated.
          {overPo ? " Exceeds the unallocated PO quantity." : ""}
          {overStock ? " A row exceeds its available stock." : ""}
        </p>
      </div>
    </form>
  );
}

export function ReleaseAllocationForm({ action }: { action: FulfillmentAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <FormInput name="reason" placeholder="Reason" aria-label="Release reason" className="h-8 w-40" required />
      <Button type="submit" variant="secondary" className="h-8" disabled={pending}>
        {pending ? "Releasing…" : "Release"}
      </Button>
      {state.message ? <span className="w-full text-[12px] text-warning">{state.message}</span> : null}
    </form>
  );
}

export function CreateFulfilmentForm({
  action,
  allocations,
}: {
  action: FulfillmentAction;
  allocations: AllocationRecord[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4 p-4">
      <ErrorAlert state={state} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
            <tr>
              <th className={thClass}>Include</th>
              <th className={thClass}>Item</th>
              <th className={thClass}>Batch</th>
              <th className={thClass}>Reserved</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((allocation) => (
              <tr key={allocation.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    name="allocationId"
                    value={allocation.id}
                    defaultChecked
                    aria-label={`Include ${allocation.batchNumber}`}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-4 py-2">
                  {allocation.lineNumber}. {allocation.productName}
                </td>
                <td className="px-4 py-2">{allocation.batchNumber}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {formatQuantity(allocation.reservedQuantity, allocation.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Planned Dispatch Date" htmlFor="plannedDate">
          <FormInput id="plannedDate" name="plannedDate" type="date" />
        </FormField>
        <FormField label="Notes" htmlFor="fulfilmentNotes">
          <FormArea id="fulfilmentNotes" name="notes" rows={2} />
        </FormField>
      </div>
      <p className="text-[12px] text-ink-muted">
        Creating a fulfilment does not consume stock. Reserved quantity is consumed only when it is dispatched.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create Fulfilment"}
      </Button>
    </form>
  );
}

export function FinalQaqcForm({
  action,
  defaultDate,
  defaultQuantity,
  currentResult,
  returnTo = "",
}: {
  action: FulfillmentAction;
  defaultDate: string;
  defaultQuantity: number;
  currentResult: string | null;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4 p-4">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <ErrorAlert state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Inspection Date" htmlFor="inspectionDate" required error={state.fieldErrors?.inspectionDate}>
          <FormInput id="inspectionDate" name="inspectionDate" type="date" defaultValue={defaultDate} required />
        </FormField>
        <FormField label="Result" htmlFor="result" required error={state.fieldErrors?.result}>
          <FormSelect id="result" name="result" defaultValue={currentResult ?? "passed"}>
            <option value="passed">Passed</option>
            <option value="conditional">Conditional</option>
            <option value="failed">Failed</option>
          </FormSelect>
        </FormField>
        <FormField label="Quantity Checked" htmlFor="quantityChecked" error={state.fieldErrors?.quantityChecked}>
          <FormInput
            id="quantityChecked"
            name="quantityChecked"
            type="number"
            min={0}
            step="0.001"
            defaultValue={defaultQuantity}
          />
        </FormField>
      </div>
      <FormField label="Notes" htmlFor="qaqcNotes" error={state.fieldErrors?.notes} hint="Required when the result is Failed.">
        <FormArea id="qaqcNotes" name="notes" rows={2} />
      </FormField>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : currentResult ? "Update Final QAQC" : "Record Final QAQC"}
      </Button>
    </form>
  );
}

export function DispatchForm({
  action,
  items,
  defaultVehicle,
  defaultDriver,
  returnTo = "",
}: {
  action: FulfillmentAction;
  items: FulfilmentItemRecord[];
  defaultVehicle: string;
  defaultDriver: string;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const open = items.filter((item) => item.remainingQuantity > 0);
  return (
    <form action={formAction} className="space-y-4 p-4">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <ErrorAlert state={state} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
            <tr>
              <th className={thClass}>Item</th>
              <th className={thClass}>Batch</th>
              <th className={thClass}>Remaining</th>
              <th className={thClass}>Dispatch now</th>
            </tr>
          </thead>
          <tbody>
            {open.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  {item.lineNumber}. {item.productName}
                </td>
                <td className="px-4 py-2">{item.batchNumber}</td>
                <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                <td className="px-4 py-2">
                  <FormInput
                    type="number"
                    name={`dispatch_${item.id}`}
                    min={0}
                    max={item.remainingQuantity}
                    step="0.001"
                    defaultValue={item.remainingQuantity}
                    aria-label={`Dispatch quantity for ${item.batchNumber}`}
                    className="w-32"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Vehicle Number" htmlFor="vehicleNumber" required error={state.fieldErrors?.vehicleNumber}>
          <FormInput id="vehicleNumber" name="vehicleNumber" defaultValue={defaultVehicle} required />
        </FormField>
        <FormField label="Driver Name" htmlFor="driverName" required error={state.fieldErrors?.driverName}>
          <FormInput id="driverName" name="driverName" defaultValue={defaultDriver} required />
        </FormField>
      </div>
      <FormField label="Dispatch Notes" htmlFor="dispatchNotes">
        <FormArea id="dispatchNotes" name="notes" rows={2} />
      </FormField>
      <p className="text-[12px] text-ink-muted">
        Dispatch reduces stock and reservation together. Enter less than the remaining quantity for a partial dispatch.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Dispatching…" : "Dispatch"}
      </Button>
    </form>
  );
}

export function CancelFulfilmentForm({
  action,
  returnTo = "",
}: {
  action: FulfillmentAction;
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 p-4">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div className="min-w-56 flex-1">
        <FormField label="Cancel fulfilment" htmlFor="cancelFulfilmentReason" error={state.message}>
          <FormInput id="cancelFulfilmentReason" name="reason" placeholder="Reason" required />
        </FormField>
      </div>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel Fulfilment"}
      </Button>
      <p className="w-full text-[12px] text-ink-muted">
        Allocations stay reserved and can be added to a new fulfilment.
      </p>
    </form>
  );
}

export function CancelPoForm({ action }: { action: FulfillmentAction }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-56 flex-1">
        <FormField label="Cancellation reason" htmlFor="cancelPoReason" required error={state.message}>
          <FormInput id="cancelPoReason" name="reason" required />
        </FormField>
      </div>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel PO and Release Inventory"}
      </Button>
    </form>
  );
}
