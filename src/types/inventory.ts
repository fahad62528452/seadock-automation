import type { InventoryItemStatus, InventoryType } from "@/types/database";

export type LifecycleState = "fresh" | "frozen" | "wastage" | "none";

export type InventoryBalanceSummary = {
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  rawQuantity: number;
  processedQuantity: number;
  frozenQuantity: number;
  wastageQuantity: number;
  freshQuantity: number;
};

export type InventoryListFilters = {
  inventoryType?: InventoryType | InventoryType[];
  lifecycle?: LifecycleState;
  batchId?: string;
  search?: string;
  status?: InventoryItemStatus;
};

export type InventoryListItem = {
  id: string;
  batchId: string;
  batchNumber: string;
  processingRunId: string | null;
  inventoryType: InventoryType;
  productSpecies: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  status: InventoryItemStatus;
  lifecycle: LifecycleState;
  originAt: string;
  freshUntil: string;
  frozenAt: string | null;
  createdAt: string;
  allocationSummary?: string | null;
};

export type InventoryMovementListItem = {
  id: string;
  inventoryItemId: string;
  batchNumber: string;
  productSpecies: string;
  movementType: string;
  quantity: number;
  unit: string;
  referenceType: string | null;
  referenceId: string | null;
  previousQuantity: number;
  newQuantity: number;
  performedAt: string;
  notes: string | null;
};

export type InventoryMovementFilters = {
  inventoryItemId?: string;
  batchId?: string;
  movementType?: string;
  limit?: number;
};

export type BatchInventorySummary = {
  batchId: string;
  batchNumber: string;
  productSpecies: string;
  receivedAt: string;
  items: InventoryListItem[];
  totals: InventoryBalanceSummary;
};

export type InventoryItemDetail = InventoryListItem & {
  movements: InventoryMovementListItem[];
};

export type FreezeResult = {
  frozenCount: number;
  frozenIds: string[];
};
