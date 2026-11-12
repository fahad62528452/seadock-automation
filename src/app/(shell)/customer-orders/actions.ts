"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import {
  changeCustomerPurchaseOrderStatus,
  createCustomer,
  createCustomerPurchaseOrder,
  updateCustomer,
  updateCustomerPurchaseOrderPriority,
} from "@/services/customer-orders/customer-order-service";
import type { CustomerInput, CustomerPoInput, CustomerPoStatus } from "@/types/customer-orders";
import type { CustomerPoPriority, CustomerStatus } from "@/types/database";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createCustomerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let customerId = "";
  try {
    requirePermission(PERMISSIONS.customerOrdersManage);
    const input: CustomerInput = {
      customerCode: formString(formData, "customerCode"),
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      phone: formString(formData, "phone"),
      address: formString(formData, "address"),
      contactPerson: formString(formData, "contactPerson"),
      status: (formString(formData, "status") || "active") as CustomerStatus,
      notes: formString(formData, "notes"),
    };
    const result = await createCustomer(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    customerId = result.data.id;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to create customer.") };
  }

  revalidatePath("/customers");
  revalidatePath("/customer-orders");
  redirect(`/customers/${customerId}?created=1`);
}

export async function updateCustomerAction(
  customerId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersManage);
    const input: CustomerInput = {
      customerCode: formString(formData, "customerCode"),
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      phone: formString(formData, "phone"),
      address: formString(formData, "address"),
      contactPerson: formString(formData, "contactPerson"),
      status: (formString(formData, "status") || "active") as CustomerStatus,
      notes: formString(formData, "notes"),
    };
    const result = await updateCustomer(customerId, input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to update customer.") };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?updated=1`);
}

export async function createCustomerPoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let poId = "";
  try {
    requirePermission(PERMISSIONS.customerOrdersCreate);
    const itemCount = Number(formString(formData, "itemCount") || "0");
    const items = Array.from({ length: itemCount }, (_, index) => ({
      productName: formString(formData, `items.${index}.productName`),
      species: formString(formData, `items.${index}.species`),
      productCode: formString(formData, `items.${index}.productCode`),
      quantity: Number(formString(formData, `items.${index}.quantity`) || "0"),
      unit: formString(formData, `items.${index}.unit`) || "kg",
      requiredDeliveryDate: formString(formData, `items.${index}.requiredDeliveryDate`),
      specifications: formString(formData, `items.${index}.specifications`),
      notes: formString(formData, `items.${index}.notes`),
    })).filter((item) => item.productName || item.species || item.quantity > 0);

    const receivedAtRaw = formString(formData, "receivedAt");
    const receivedAtDate = new Date(receivedAtRaw);
    const receivedAt = Number.isNaN(receivedAtDate.getTime()) ? receivedAtRaw : receivedAtDate.toISOString();

    const input: CustomerPoInput = {
      customerId: formString(formData, "customerId"),
      poNumber: formString(formData, "poNumber"),
      poDate: formString(formData, "poDate"),
      receivedAt,
      requiredDeliveryDate: formString(formData, "requiredDeliveryDate"),
      priority: (formString(formData, "priority") || "normal") as CustomerPoPriority,
      notes: formString(formData, "notes"),
      source: "manual",
      items,
    };

    const result = await createCustomerPurchaseOrder(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    poId = result.data.customerPurchaseOrderId;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to create customer purchase order.") };
  }

  revalidatePath("/customer-orders");
  revalidatePath("/");
  revalidatePath("/audit");
  redirect(`/customer-orders/${poId}?created=1`);
}

export async function changeCustomerPoStatusAction(
  poId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    requirePermission(PERMISSIONS.customerOrdersStatus);
    const toStatus = formString(formData, "toStatus") as CustomerPoStatus;
    const markActionRequired = formString(formData, "markActionRequired") === "on";
    const result = await changeCustomerPurchaseOrderStatus(poId, {
      toStatus: markActionRequired && toStatus !== "cancelled" ? "action_required" : toStatus,
      reason: formString(formData, "reason"),
      notes: formString(formData, "notes"),
      markActionRequired: markActionRequired || toStatus === "action_required",
      actionRequiredReason: formString(formData, "actionRequiredReason") || formString(formData, "reason"),
    });
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to change customer PO status.") };
  }

  revalidatePath("/customer-orders");
  revalidatePath(`/customer-orders/${poId}`);
  revalidatePath("/");
  revalidatePath("/audit");
  redirect(`/customer-orders/${poId}?status=1`);
}

export async function updateCustomerPoPriorityAction(poId: string, formData: FormData): Promise<void> {
  requirePermission(PERMISSIONS.customerOrdersManage);
  const priority = (formString(formData, "priority") || "normal") as CustomerPoPriority;
  const result = await updateCustomerPurchaseOrderPriority(poId, priority);
  if (!result.ok) {
    throw new Error(result.error);
  }

  revalidatePath("/customer-orders");
  revalidatePath(`/customer-orders/${poId}`);
  revalidatePath("/");
  redirect(`/customer-orders/${poId}?updated=1`);
}
