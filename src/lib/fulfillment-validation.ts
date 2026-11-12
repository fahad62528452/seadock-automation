import { roundQuantity } from "@/lib/quantity";
import type {
  AllocateInventoryInput,
  CreateFulfilmentInput,
  DispatchFulfilmentInput,
  FinalQaqcInput,
} from "@/types/fulfillment";

/** Cheap input checks. Business rules (stock, status, QAQC gate) are enforced by the RPCs. */

export function validateAllocationInput(input: AllocateInventoryInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.customerPoItemId.trim()) errors.customerPoItemId = "PO item is required.";
  if (!input.lines.length) {
    errors.lines = "Enter a quantity for at least one inventory row.";
    return errors;
  }
  input.lines.forEach((line, index) => {
    if (!line.inventoryItemId.trim()) errors[`lines.${index}.inventoryItemId`] = "Inventory item is required.";
    if (!(roundQuantity(line.quantity) > 0)) {
      errors[`lines.${index}.quantity`] = "Quantity must be greater than zero.";
    }
  });
  return errors;
}

export function validateReason(reason: string, label = "Reason"): Record<string, string> {
  return reason.trim() ? {} : { reason: `${label} is required.` };
}

export function validateCreateFulfilmentInput(input: CreateFulfilmentInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.customerPoId.trim()) errors.customerPoId = "Customer PO is required.";
  if (!input.allocationIds.length) errors.allocationIds = "Select at least one active allocation.";
  return errors;
}

export function validateFinalQaqcInput(input: FinalQaqcInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.fulfilmentId.trim()) errors.fulfilmentId = "Fulfilment is required.";
  if (!input.inspectionDate.trim()) errors.inspectionDate = "Inspection date is required.";
  if (!["passed", "conditional", "failed"].includes(input.result)) {
    errors.result = "Final QAQC result is required.";
  }
  if (input.quantityChecked != null && roundQuantity(input.quantityChecked) < 0) {
    errors.quantityChecked = "Quantity checked cannot be negative.";
  }
  if (input.result === "failed" && !input.notes.trim()) {
    errors.notes = "Notes are required when final QAQC fails.";
  }
  return errors;
}

export function validateDispatchInput(input: DispatchFulfilmentInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.fulfilmentId.trim()) errors.fulfilmentId = "Fulfilment is required.";
  if (!input.vehicleNumber.trim()) errors.vehicleNumber = "Vehicle number is required.";
  if (!input.driverName.trim()) errors.driverName = "Driver name is required.";
  input.lines.forEach((line, index) => {
    if (!(roundQuantity(line.quantity) > 0)) {
      errors[`lines.${index}.quantity`] = "Dispatch quantity must be greater than zero.";
    }
  });
  if (!input.lines.length) errors.lines = "Enter a dispatch quantity for at least one item.";
  return errors;
}
