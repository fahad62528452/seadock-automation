import { quantityGreaterThan, quantitiesEqual, roundQuantity, toMilli } from "@/lib/quantity";
import type { ProcessingRunInput } from "@/types/processing";

export function validateProcessingInput(
  input: ProcessingRunInput,
  availableQuantity?: number,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.parentBatchId.trim()) errors.parentBatchId = "Parent batch is required.";
  if (!input.processingDate.trim()) errors.processingDate = "Processing date is required.";
  if (!input.operatorName.trim()) errors.operatorName = "Processing operator is required.";

  const inputQty = roundQuantity(Number(input.inputQuantity) || 0);
  const yieldQty = roundQuantity(Number(input.yieldQuantity) || 0);
  const wastageQty = roundQuantity(Number(input.wastageQuantity) || 0);

  if (!(inputQty > 0)) errors.inputQuantity = "Input quantity must be greater than zero.";
  if (yieldQty < 0) errors.yieldQuantity = "Yield cannot be negative.";
  if (wastageQty < 0) errors.wastageQuantity = "Wastage cannot be negative.";
  if (!input.unit.trim()) errors.unit = "Unit is required.";

  if (availableQuantity != null && quantityGreaterThan(inputQty, availableQuantity)) {
    errors.inputQuantity = "Processing quantity cannot exceed available batch inventory.";
  }

  if (!input.saveAsDraft) {
    if (!quantitiesEqual(inputQty, yieldQty + wastageQty)) {
      errors.reconciliation = "Input quantity must equal yield quantity plus wastage quantity.";
    }
    if (!["passed", "failed", "conditional"].includes(input.qaqc.result)) {
      errors.qaqcResult = "QAQC result is required.";
    }
    if (!input.qaqc.inspectionDate.trim()) {
      errors.inspectionDate = "Inspection date is required.";
    }
  }

  return errors;
}

export function normalizeProcessingQuantities(input: ProcessingRunInput) {
  return {
    inputQuantity: roundQuantity(Number(input.inputQuantity) || 0),
    yieldQuantity: roundQuantity(Number(input.yieldQuantity) || 0),
    wastageQuantity: roundQuantity(Number(input.wastageQuantity) || 0),
    milliInput: toMilli(Number(input.inputQuantity) || 0),
  };
}
