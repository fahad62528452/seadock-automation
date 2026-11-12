import type { CustomerPoPriority, CustomerPoStatus } from "@/types/customer-orders";

export function labelCustomerPoStatus(status: string): string {
  const labels: Record<string, string> = {
    received: "Received",
    under_review: "Under Review",
    action_required: "Action Required",
    approved: "Approved",
    partially_allocated: "Partially Allocated",
    ready_for_fulfillment: "Ready for Fulfillment",
    partially_fulfilled: "Partially Fulfilled",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
    awaiting_verification: "Received",
    verified: "Approved",
    pending_fulfilment: "Ready for Fulfillment",
  };
  return labels[status] ?? status;
}

export function labelCustomerPoPriority(priority: string): string {
  const labels: Record<string, string> = {
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  };
  return labels[priority] ?? priority;
}

export function priorityBadgeText(priority: CustomerPoPriority | string): string {
  if (priority === "urgent") return "URGENT";
  if (priority === "high") return "HIGH";
  return "NORMAL";
}

export const CUSTOMER_PO_WORKFLOW_STEPS: CustomerPoStatus[] = [
  "received",
  "under_review",
  "approved",
  "ready_for_fulfillment",
  "fulfilled",
];

export function normalizeCustomerPoStatus(status: string): CustomerPoStatus {
  const map: Record<string, CustomerPoStatus> = {
    awaiting_verification: "received",
    verified: "approved",
    pending_fulfilment: "ready_for_fulfillment",
  };
  return (map[status] ?? status) as CustomerPoStatus;
}

export const UNIT_OPTIONS = ["kg", "mt", "box", "crate", "piece"] as const;
