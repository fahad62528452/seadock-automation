"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission, toUserMessage } from "@/lib/authz";
import {
  completeReceiving,
  createPurchaseOrder,
  createVendor,
  updateVendor,
} from "@/services/procurement/procurement-service";
import type { CompleteReceivingInput, PurchaseOrderInput, VendorInput } from "@/types/procurement";
import type { VendorStatus } from "@/types/database";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createVendorAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let vendorId = "";

  try {
    requirePermission(PERMISSIONS.purchasesManage);
    const input: VendorInput = {
      vendorCode: formString(formData, "vendorCode"),
      vendorName: formString(formData, "vendorName"),
      contactPerson: formString(formData, "contactPerson"),
      phone: formString(formData, "phone"),
      email: formString(formData, "email"),
      address: formString(formData, "address"),
      status: (formString(formData, "status") || "active") as VendorStatus,
      notes: formString(formData, "notes"),
    };

    const result = await createVendor(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    vendorId = result.data.id;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to create vendor.") };
  }

  revalidatePath("/purchases/vendors");
  redirect(`/purchases/vendors/${vendorId}?created=1`);
}

export async function updateVendorAction(
  vendorId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    requirePermission(PERMISSIONS.purchasesManage);
    const input: VendorInput = {
      vendorCode: formString(formData, "vendorCode"),
      vendorName: formString(formData, "vendorName"),
      contactPerson: formString(formData, "contactPerson"),
      phone: formString(formData, "phone"),
      email: formString(formData, "email"),
      address: formString(formData, "address"),
      status: (formString(formData, "status") || "active") as VendorStatus,
      notes: formString(formData, "notes"),
    };

    const result = await updateVendor(vendorId, input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to update vendor.") };
  }

  revalidatePath("/purchases/vendors");
  revalidatePath(`/purchases/vendors/${vendorId}`);
  redirect(`/purchases/vendors/${vendorId}?updated=1`);
}

export async function createPurchaseOrderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let purchaseOrderId = "";

  try {
    requirePermission(PERMISSIONS.purchasesManage);

    const itemCount = Number(formString(formData, "itemCount") || "0");
    const items = Array.from({ length: itemCount }, (_, index) => ({
      productSpecies: formString(formData, `items.${index}.productSpecies`),
      orderedQuantity: Number(formString(formData, `items.${index}.orderedQuantity`) || "0"),
      unit: formString(formData, `items.${index}.unit`) || "kg",
      notes: formString(formData, `items.${index}.notes`),
    })).filter((item) => item.productSpecies || item.orderedQuantity > 0);

    const input: PurchaseOrderInput = {
      poNumber: formString(formData, "poNumber"),
      vendorId: formString(formData, "vendorId"),
      poDate: formString(formData, "poDate"),
      expectedDate: formString(formData, "expectedDate"),
      notes: formString(formData, "notes"),
      status: formString(formData, "status") === "draft" ? "draft" : "issued",
      items,
    };

    const result = await createPurchaseOrder(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    purchaseOrderId = result.data.id;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to create purchase order.") };
  }

  revalidatePath("/purchases/orders");
  redirect(`/purchases/orders/${purchaseOrderId}?created=1`);
}

export async function completeReceivingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let goodsReceiptId = "";

  try {
    const session = requirePermission(PERMISSIONS.purchasesManage);
    requirePermission(PERMISSIONS.qaqcManage);

    const allowOverReceive = formString(formData, "allowOverReceive") === "on";
    if (allowOverReceive && !["super_admin", "manager", "warehouse_manager"].includes(session.role)) {
      return { ok: false, message: "Only managers can override remaining quantities." };
    }

    const itemCount = Number(formString(formData, "itemCount") || "0");
    const items = Array.from({ length: itemCount }, (_, index) => ({
      purchaseOrderItemId: formString(formData, `items.${index}.purchaseOrderItemId`),
      receivedQuantity: Number(formString(formData, `items.${index}.receivedQuantity`) || "0"),
      unit: formString(formData, `items.${index}.unit`) || "kg",
      notes: formString(formData, `items.${index}.notes`),
    }));

    const receivedAtRaw = formString(formData, "receivedAt");
    const receivedAtDate = new Date(receivedAtRaw);
    const receivedAt = Number.isNaN(receivedAtDate.getTime()) ? receivedAtRaw : receivedAtDate.toISOString();

    const input: CompleteReceivingInput = {
      purchaseOrderId: formString(formData, "purchaseOrderId"),
      receiptNumber: formString(formData, "receiptNumber"),
      receivedAt,
      driverName: formString(formData, "driverName"),
      vehicleNumber: formString(formData, "vehicleNumber"),
      notes: formString(formData, "notes"),
      items,
      qaqc: {
        inspectionDate: formString(formData, "inspectionDate"),
        result: formString(formData, "qaqcResult") as CompleteReceivingInput["qaqc"]["result"],
        notes: formString(formData, "qaqcNotes"),
      },
      allowOverReceive,
    };

    const result = await completeReceiving(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    goodsReceiptId = result.data.goodsReceiptId;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to complete goods receiving.") };
  }

  revalidatePath("/purchases/goods-received");
  revalidatePath("/purchases/orders");
  revalidatePath("/inventory/batches");
  revalidatePath("/audit");
  redirect(`/purchases/goods-received/${goodsReceiptId}?created=1`);
}
