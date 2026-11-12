import { getFreshUntil } from "@/lib/fresh-window";
import type { InventoryType } from "@/types/database";
import type { LifecycleState } from "@/types/inventory";

const FRESH_TYPES: InventoryType[] = ["raw", "processed"];

export function getInventoryOriginAt(params: {
  inventoryType: InventoryType | string;
  createdAt: string;
  batchReceivedAt: string;
}): string {
  if (params.inventoryType === "raw") return params.batchReceivedAt;
  return params.createdAt;
}

export function getLifecycleState(params: {
  inventoryType: InventoryType | string;
  quantity: number;
  frozenAt?: string | null;
  now?: Date;
  originAt?: string;
}): LifecycleState {
  if (params.quantity <= 0) return "none";
  if (params.inventoryType === "wastage") return "wastage";
  if (params.inventoryType === "frozen") return "frozen";
  if (FRESH_TYPES.includes(params.inventoryType as InventoryType)) return "fresh";
  return "none";
}

export function isPastFreshCutoff(originAt: string, now = new Date()): boolean {
  return now.getTime() >= new Date(getFreshUntil(originAt)).getTime();
}

export function isEligibleForFreeze(params: {
  inventoryType: InventoryType | string;
  quantity: number;
  frozenAt?: string | null;
  originAt: string;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  if (params.quantity <= 0) return false;
  if (params.inventoryType === "wastage" || params.inventoryType === "frozen") return false;
  if (!FRESH_TYPES.includes(params.inventoryType as InventoryType)) return false;
  return isPastFreshCutoff(params.originAt, now);
}
