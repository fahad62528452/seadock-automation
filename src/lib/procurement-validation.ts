import type { VendorInput, PurchaseOrderItemInput } from "@/types/procurement";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function validateVendorInput(input: VendorInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeText(input.vendorCode)) errors.vendorCode = "Vendor code is required.";
  if (!normalizeText(input.vendorName)) errors.vendorName = "Vendor name is required.";
  if (!input.status) errors.status = "Status is required.";
  const email = normalizeText(input.email);
  if (email && !EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  return errors;
}

export function validatePurchaseOrderInput(input: {
  poNumber: string;
  vendorId: string;
  poDate: string;
  items: PurchaseOrderItemInput[];
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeText(input.poNumber)) errors.poNumber = "PO number is required.";
  if (!normalizeText(input.vendorId)) errors.vendorId = "Vendor is required.";
  if (!normalizeText(input.poDate)) errors.poDate = "PO date is required.";
  if (!input.items.length) errors.items = "Add at least one purchase order item.";

  input.items.forEach((item, index) => {
    if (!normalizeText(item.productSpecies)) {
      errors[`items.${index}.productSpecies`] = "Product / species is required.";
    }
    if (!(item.orderedQuantity > 0)) {
      errors[`items.${index}.orderedQuantity`] = "Quantity must be greater than zero.";
    }
    if (!normalizeText(item.unit)) {
      errors[`items.${index}.unit`] = "Unit is required.";
    }
  });

  return errors;
}

export function validateReceivingInput(input: {
  purchaseOrderId: string;
  receiptNumber: string;
  receivedAt: string;
  driverName: string;
  vehicleNumber: string;
  items: Array<{ purchaseOrderItemId: string; receivedQuantity: number; unit: string }>;
  qaqc: { inspectionDate: string; result: string };
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeText(input.purchaseOrderId)) errors.purchaseOrderId = "Purchase order is required.";
  if (!normalizeText(input.receiptNumber)) errors.receiptNumber = "Receipt number is required.";
  if (!normalizeText(input.receivedAt)) errors.receivedAt = "Received date/time is required.";
  if (!normalizeText(input.driverName)) errors.driverName = "Driver name is required.";
  if (!normalizeText(input.vehicleNumber)) errors.vehicleNumber = "Vehicle number is required.";
  if (!normalizeText(input.qaqc.inspectionDate)) errors.inspectionDate = "Inspection date is required.";
  if (!["passed", "failed", "conditional"].includes(input.qaqc.result)) {
    errors.qaqcResult = "Select a QAQC result.";
  }

  const positive = input.items.filter((item) => item.receivedQuantity > 0);
  if (!positive.length) errors.items = "Enter at least one receiving quantity greater than zero.";

  input.items.forEach((item, index) => {
    if (item.receivedQuantity < 0) {
      errors[`items.${index}.receivedQuantity`] = "Quantity cannot be negative.";
    }
    if (item.receivedQuantity > 0 && !normalizeText(item.unit)) {
      errors[`items.${index}.unit`] = "Unit is required.";
    }
  });

  return errors;
}
