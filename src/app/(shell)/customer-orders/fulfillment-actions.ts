"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import {
  allocateInventory,
  cancelFulfilment,
  cancelPoReleasingAllocations,
  createFulfilment,
  dispatchFulfilment,
  recordFinalQaqc,
  releaseAllocation,
} from "@/services/fulfillment/fulfillment-service";
import type { FinalQaqcFormResult } from "@/types/fulfillment";

export type FulfillmentActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Collects `prefix<id>` numeric inputs that have a positive quantity. */
function collectQuantities(formData: FormData, prefix: string): Array<{ id: string; quantity: number }> {
  const lines: Array<{ id: string; quantity: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(prefix) || typeof value !== "string") continue;
    const quantity = Number(value);
    if (Number.isFinite(quantity) && quantity > 0) lines.push({ id: key.slice(prefix.length), quantity });
  }
  return lines;
}

function refresh(poId: string, fulfilmentId?: string) {
  revalidatePath("/customer-orders");
  revalidatePath(`/customer-orders/${poId}`);
  revalidatePath(`/customer-orders/${poId}/fulfill`);
  revalidatePath("/inventory/batches");
  revalidatePath("/inventory/movements");
  revalidatePath("/");
  revalidatePath("/audit");
  revalidatePath("/fulfilment");
  revalidatePath("/qaqc/final");
  revalidatePath("/orders/pending");
  revalidatePath("/orders/fulfilled");
  if (fulfilmentId) revalidatePath(`/fulfilment/${fulfilmentId}`);
}

function done(poId: string, key: string, formData: FormData, fulfilmentId?: string): never {
  refresh(poId, fulfilmentId);
  const returnTo = formString(formData, "returnTo").trim();
  if (returnTo.startsWith("/fulfilment")) {
    redirect(`${returnTo}?done=${key}`);
  }
  redirect(`/customer-orders/${poId}/fulfill?done=${key}`);
}

export async function allocateInventoryAction(
  poId: string,
  customerPoItemId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersAllocate);
    const lines = collectQuantities(formData, "qty_").map((line) => ({
      inventoryItemId: line.id,
      quantity: line.quantity,
    }));
    const result = await allocateInventory({ customerPoItemId, lines });
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to allocate inventory.") };
  }
  done(poId, "allocated", formData);
}

export async function releaseAllocationAction(
  poId: string,
  allocationId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersAllocate);
    const result = await releaseAllocation(allocationId, formString(formData, "reason"));
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to release allocation.") };
  }
  done(poId, "released", formData);
}

export async function createFulfilmentAction(
  poId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersFulfill);
    const result = await createFulfilment({
      customerPoId: poId,
      allocationIds: formData.getAll("allocationId").filter((value): value is string => typeof value === "string"),
      plannedDate: formString(formData, "plannedDate"),
      notes: formString(formData, "notes"),
    });
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to create fulfilment.") };
  }
  done(poId, "fulfilment", formData);
}

export async function cancelFulfilmentAction(
  poId: string,
  fulfilmentId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersFulfill);
    const result = await cancelFulfilment(fulfilmentId, formString(formData, "reason"));
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to cancel fulfilment.") };
  }
  done(poId, "fulfilment-cancelled", formData, fulfilmentId);
}

export async function recordFinalQaqcAction(
  poId: string,
  fulfilmentId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersQaqc);
    const quantityRaw = formString(formData, "quantityChecked").trim();
    const result = await recordFinalQaqc({
      fulfilmentId,
      inspectionDate: formString(formData, "inspectionDate"),
      result: formString(formData, "result") as FinalQaqcFormResult,
      quantityChecked: quantityRaw === "" ? null : Number(quantityRaw),
      notes: formString(formData, "notes"),
    });
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to record final QAQC.") };
  }
  done(poId, "qaqc", formData, fulfilmentId);
}

export async function dispatchFulfilmentAction(
  poId: string,
  fulfilmentId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersDispatch);
    const result = await dispatchFulfilment({
      fulfilmentId,
      lines: collectQuantities(formData, "dispatch_").map((line) => ({
        fulfilmentItemId: line.id,
        quantity: line.quantity,
      })),
      vehicleNumber: formString(formData, "vehicleNumber"),
      driverName: formString(formData, "driverName"),
      notes: formString(formData, "notes"),
    });
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to dispatch fulfilment.") };
  }
  done(poId, "dispatched", formData, fulfilmentId);
}

export async function cancelPoReleasingAllocationsAction(
  poId: string,
  _prev: FulfillmentActionState,
  formData: FormData,
): Promise<FulfillmentActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersStatus);
    const result = await cancelPoReleasingAllocations(poId, formString(formData, "reason"));
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to cancel customer purchase order.") };
  }
  refresh(poId);
  redirect(`/customer-orders/${poId}?cancelled=1`);
}
