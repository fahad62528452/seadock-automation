import type { LifecycleState } from "@/types/inventory";

export function labelLifecycle(lifecycle: LifecycleState): string {
  const labels: Record<LifecycleState, string> = {
    fresh: "Fresh",
    frozen: "Frozen",
    wastage: "Wastage",
    none: "—",
  };
  return labels[lifecycle] ?? lifecycle;
}

export function labelInventoryItemStatus(status: string): string {
  const labels: Record<string, string> = {
    available: "Available",
    reserved: "Reserved",
    dispatched: "Dispatched",
    archived: "Archived",
  };
  return labels[status] ?? status;
}

export function labelMovementType(type: string): string {
  const labels: Record<string, string> = {
    receipt: "Receipt",
    processing_consumption: "Processing consumption",
    processing_yield: "Processing yield",
    processing_wastage: "Processing wastage",
    fresh_to_frozen: "Fresh to frozen",
    reservation: "Reservation",
    release: "Release",
    dispatch: "Dispatch",
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export function inventoryAgeDays(originAt: string, now = new Date()): number {
  const start = new Date(originAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / (24 * 60 * 60 * 1000)));
}
