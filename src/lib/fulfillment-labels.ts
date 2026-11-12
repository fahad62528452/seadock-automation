export function labelFulfilmentStatus(status: string): string {
  const labels: Record<string, string> = {
    draft: "Awaiting Final QAQC",
    ready: "Ready for Dispatch",
    partially_dispatched: "Partially Dispatched",
    dispatched: "Dispatched",
    fulfilled: "Fulfilled",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}

export function labelAllocationStatus(status: string): string {
  const labels: Record<string, string> = {
    active: "Reserved",
    released: "Released",
    fulfilled: "Dispatched",
  };
  return labels[status] ?? status;
}

export function labelInventoryType(type: string): string {
  const labels: Record<string, string> = {
    raw: "Raw",
    processed: "Processed",
    frozen: "Frozen",
    wastage: "Wastage",
  };
  return labels[type] ?? type;
}
