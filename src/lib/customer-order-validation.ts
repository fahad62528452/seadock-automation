import type { CustomerInput, CustomerPoInput } from "@/types/customer-orders";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function validateCustomerInput(input: CustomerInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeText(input.customerCode)) errors.customerCode = "Customer code is required.";
  if (!normalizeText(input.name)) errors.name = "Customer name is required.";
  if (!input.status) errors.status = "Status is required.";
  const email = normalizeText(input.email);
  if (email && !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  return errors;
}

export function validateCustomerPoInput(input: CustomerPoInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!normalizeText(input.customerId)) errors.customerId = "Customer is required.";
  if (!normalizeText(input.poNumber)) errors.poNumber = "PO number is required.";
  if (!normalizeText(input.poDate)) errors.poDate = "PO date is required.";
  if (!normalizeText(input.receivedAt)) errors.receivedAt = "Received date/time is required.";
  if (!["normal", "high", "urgent"].includes(input.priority)) {
    errors.priority = "Priority is required.";
  }

  const items = input.items.filter(
    (item) => normalizeText(item.productName) || item.quantity > 0 || normalizeText(item.species),
  );
  if (!items.length) {
    errors.items = "At least one PO item is required.";
  } else {
    items.forEach((item, index) => {
      if (!normalizeText(item.productName) && !normalizeText(item.species)) {
        errors[`items.${index}.productName`] = "Product / species is required.";
      }
      if (!(item.quantity > 0)) {
        errors[`items.${index}.quantity`] = "Quantity must be greater than zero.";
      }
      if (!normalizeText(item.unit)) {
        errors[`items.${index}.unit`] = "Unit is required.";
      }
    });
  }

  return errors;
}
