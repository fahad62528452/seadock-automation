"use client";

import { useActionState, useState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/customer-orders/actions";
import { UNIT_OPTIONS } from "@/lib/customer-order-labels";
import type { CustomerRecord } from "@/types/customer-orders";

const initialState: ActionState = { ok: false };

type Line = {
  productName: string;
  species: string;
  productCode: string;
  quantity: string;
  unit: string;
  requiredDeliveryDate: string;
  specifications: string;
  notes: string;
};

function toDateTimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function CustomerPoForm({
  action,
  customers,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customers: CustomerRecord[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [items, setItems] = useState<Line[]>([
    {
      productName: "",
      species: "",
      productCode: "",
      quantity: "",
      unit: "kg",
      requiredDeliveryDate: "",
      specifications: "",
      notes: "",
    },
  ]);

  return (
    <form action={formAction} className="space-y-5">
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="itemCount" value={items.length} />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Customer" htmlFor="customerId" required error={state.fieldErrors?.customerId}>
          <FormSelect id="customerId" name="customerId" required defaultValue="">
            <option value="" disabled>
              Select customer
            </option>
            {customers
              .filter((customer) => customer.status === "active")
              .map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customerCode} — {customer.name}
                </option>
              ))}
          </FormSelect>
        </FormField>
        <FormField label="PO Number" htmlFor="poNumber" required error={state.fieldErrors?.poNumber}>
          <FormInput id="poNumber" name="poNumber" required placeholder="PO-1001" />
        </FormField>
        <FormField label="PO Date" htmlFor="poDate" required error={state.fieldErrors?.poDate}>
          <FormInput id="poDate" name="poDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </FormField>
        <FormField label="Received Date / Time" htmlFor="receivedAt" required error={state.fieldErrors?.receivedAt}>
          <FormInput id="receivedAt" name="receivedAt" type="datetime-local" required defaultValue={toDateTimeLocalValue()} />
        </FormField>
        <FormField label="Required Delivery Date" htmlFor="requiredDeliveryDate">
          <FormInput id="requiredDeliveryDate" name="requiredDeliveryDate" type="date" />
        </FormField>
        <FormField label="Priority" htmlFor="priority" required error={state.fieldErrors?.priority}>
          <FormSelect id="priority" name="priority" defaultValue="normal">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
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
              setItems((current) => [
                ...current,
                {
                  productName: "",
                  species: "",
                  productCode: "",
                  quantity: "",
                  unit: "kg",
                  requiredDeliveryDate: "",
                  specifications: "",
                  notes: "",
                },
              ])
            }
          >
            + Add Item
          </Button>
        </div>
        {state.fieldErrors?.items ? <Alert tone="error">{state.fieldErrors.items}</Alert> : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <th className="px-3 py-2 font-medium">Product / Species</th>
                <th className="px-3 py-2 font-medium">Product Code</th>
                <th className="px-3 py-2 font-medium">Quantity</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Required Delivery</th>
                <th className="px-3 py-2 font-medium">Specifications</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.productName`}
                      value={item.productName}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productName: event.target.value, species: event.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Product / species"
                    />
                    <input type="hidden" name={`items.${index}.species`} value={item.species || item.productName} />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.productCode`}
                      value={item.productCode}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, productCode: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.quantity`}
                      type="number"
                      step="0.001"
                      min="0"
                      value={item.quantity}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, quantity: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormSelect
                      name={`items.${index}.unit`}
                      value={item.unit}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, unit: event.target.value } : row,
                          ),
                        )
                      }
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </FormSelect>
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.requiredDeliveryDate`}
                      type="date"
                      value={item.requiredDeliveryDate}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, requiredDeliveryDate: event.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <FormInput
                      name={`items.${index}.specifications`}
                      value={item.specifications}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, specifications: event.target.value } : row,
                          ),
                        )
                      }
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

      <Button type="submit" disabled={pending || customers.length === 0}>
        {pending ? "Creating…" : "Create Customer PO"}
      </Button>
    </form>
  );
}
