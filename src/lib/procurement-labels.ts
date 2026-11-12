export function labelPurchaseOrderStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    awaiting_verification: "Awaiting Verification",
    confirmed: "Confirmed",
    issued: "Issued",
    partially_received: "Partially Received",
    received: "Received",
    closed: "Closed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function labelGoodsReceiptStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending_qaqc: "Pending QAQC",
    accepted: "Accepted",
    rejected: "Rejected",
    received: "Received",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function labelQaqcResult(result: string | null): string {
  if (!result) return "—";
  const labels: Record<string, string> = {
    passed: "Passed",
    failed: "Failed",
    conditional: "Conditional",
    on_hold: "On Hold",
  };
  return labels[result] ?? result;
}

export function labelVendorStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatQuantity(value: number, unit = "kg"): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value)} ${unit}`;
}

export function labelProcessingStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    pending: "Draft",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}
