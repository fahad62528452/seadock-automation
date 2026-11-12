import type {
  FulfilmentStatus,
  InventoryAllocationStatus,
  InventoryType,
  QaqcResult,
} from "@/types/database";
import type { ServiceResult } from "@/types/procurement";

/**
 * Stock model
 *   total (quantity)  physical stock on hand
 *   reserved          promised to active customer allocations
 *   available         total - reserved
 *   dispatched        left the warehouse on a fulfilment (reduces total and reserved together)
 */

export type FinalQaqcFormResult = Extract<QaqcResult, "passed" | "conditional" | "failed">;

export interface AvailableInventoryOption {
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  inventoryType: InventoryType;
  productSpecies: string;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
  storageLocation: string | null;
  processingRunNumber: string | null;
}

export interface ItemAvailability {
  customerPoItemId: string;
  lineNumber: number;
  productName: string;
  species: string;
  unit: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  /** Reserved against open allocations (active, not yet dispatched). */
  allocatedQuantity: number;
  /** Requested minus fulfilled minus open allocations. */
  unallocatedQuantity: number;
  options: AvailableInventoryOption[];
}

export interface AvailableInventoryForOrder {
  customerPoId: string;
  poNumber: string;
  items: ItemAvailability[];
}

export interface AllocationRecord {
  id: string;
  customerPoItemId: string;
  lineNumber: number;
  productName: string;
  fulfilmentId: string | null;
  fulfilmentNumber: string | null;
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  inventoryType: InventoryType;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  /** Still reserved: allocated minus fulfilled while active, otherwise zero. */
  reservedQuantity: number;
  unit: string;
  status: InventoryAllocationStatus;
  allocatedAt: string;
  releasedAt: string | null;
  releaseReason: string | null;
}

export interface FulfilmentItemRecord {
  id: string;
  customerPoItemId: string;
  lineNumber: number;
  productName: string;
  allocationId: string | null;
  inventoryItemId: string;
  batchId: string;
  batchNumber: string;
  quantity: number;
  dispatchedQuantity: number;
  remainingQuantity: number;
  unit: string;
}

export interface FinalQaqcRecord {
  id: string;
  fulfilmentId: string;
  inspectionDate: string;
  result: QaqcResult | null;
  quantityChecked: number | null;
  notes: string | null;
  status: string;
  inspectorName: string | null;
  recordedAt: string;
}

export interface FulfilmentRecord {
  id: string;
  fulfilmentNumber: string;
  status: FulfilmentStatus;
  plannedDate: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  dispatchedAt: string | null;
  fulfilledAt: string | null;
  notes: string | null;
  createdAt: string;
  items: FulfilmentItemRecord[];
  finalQaqc: FinalQaqcRecord | null;
  totalQuantity: number;
  dispatchedQuantity: number;
  /** True when final QAQC is passed or conditional and quantity remains to dispatch. */
  canDispatch: boolean;
}

export interface ItemReconciliation {
  customerPoItemId: string;
  lineNumber: number;
  productName: string;
  species: string;
  unit: string;
  requestedQuantity: number;
  /** Open reservations: active allocations not yet dispatched. */
  allocatedQuantity: number;
  fulfilledQuantity: number;
  /** Requested minus fulfilled. */
  remainingQuantity: number;
  /** Requested minus fulfilled minus open allocations. */
  unallocatedQuantity: number;
}

export interface FulfillmentTotals {
  requestedQuantity: number;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  remainingQuantity: number;
  unallocatedQuantity: number;
}

export interface CustomerPoFulfillmentDetail {
  customerPoId: string;
  poNumber: string;
  poStatus: string;
  items: ItemReconciliation[];
  totals: FulfillmentTotals;
  allocations: AllocationRecord[];
  fulfilments: FulfilmentRecord[];
}

/** Compact summary attached to the customer PO detail model. */
export interface CustomerPoFulfillmentSummary extends FulfillmentTotals {
  activeAllocationCount: number;
  fulfilmentCount: number;
}

export interface AllocateInventoryInput {
  customerPoItemId: string;
  lines: Array<{ inventoryItemId: string; quantity: number }>;
}

export interface CreateFulfilmentInput {
  customerPoId: string;
  allocationIds: string[];
  plannedDate: string;
  notes: string;
}

export interface FinalQaqcInput {
  fulfilmentId: string;
  inspectionDate: string;
  result: FinalQaqcFormResult;
  quantityChecked: number | null;
  notes: string;
}

export interface DispatchFulfilmentInput {
  fulfilmentId: string;
  lines: Array<{ fulfilmentItemId: string; quantity: number }>;
  vehicleNumber: string;
  driverName: string;
  notes: string;
}

export interface BatchUsageInventoryItem {
  inventoryItemId: string;
  inventoryType: InventoryType;
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  unit: string;
}

export interface BatchUsageAllocation {
  allocationId: string;
  customerPoId: string;
  poNumber: string;
  customerName: string;
  fulfilmentNumber: string | null;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  status: InventoryAllocationStatus;
  unit: string;
}

export interface BatchFulfillmentUsage {
  batchId: string;
  unit: string;
  /** Sellable stock (processed and frozen only). Wastage and raw are excluded. */
  totalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  /** Lifetime quantity dispatched to customers from this batch. */
  dispatchedQuantity: number;
  inventoryItems: BatchUsageInventoryItem[];
  allocations: BatchUsageAllocation[];
}

export interface FulfillmentDashboardStats {
  awaitingFinalQaqc: number;
  readyForDispatch: number;
}

export type OperationalFulfilmentBucket =
  | "ready_for_fulfilment"
  | "awaiting_final_qaqc"
  | "ready_to_dispatch"
  | "completed"
  | "blocked_qaqc";

export interface OperationalFulfilmentRow {
  fulfilmentId: string;
  fulfilmentNumber: string;
  customerPoId: string;
  poNumber: string;
  customerName: string;
  customerCode: string;
  priority: "normal" | "high" | "urgent";
  requiredDeliveryDate: string | null;
  plannedDate: string | null;
  status: string;
  qaqcResult: QaqcResult | null;
  canDispatch: boolean;
  totalQuantity: number;
  dispatchedQuantity: number;
  remainingQuantity: number;
  unit: string;
  batchNumbers: string[];
  productSummary: string;
  vehicleNumber: string | null;
  driverName: string | null;
  dispatchedAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export type OperationalFulfilmentBoard = Record<OperationalFulfilmentBucket, OperationalFulfilmentRow[]>;

export interface FulfilmentWorkspaceItem extends FulfilmentItemRecord {
  inventoryType: InventoryType;
  allocatedQuantity: number;
  qaqcResult: QaqcResult | null;
}

export interface FulfilmentTraceabilityLink {
  batchId: string;
  batchNumber: string;
  inventoryItemId: string;
  inventoryType: InventoryType;
  processingRunId: string | null;
  processingRunNumber: string | null;
  goodsReceiptId: string;
  receiptNumber: string;
  vendorId: string;
  vendorName: string;
}

export interface FulfilmentWorkspaceDetail extends FulfilmentRecord {
  customerPoId: string;
  poNumber: string;
  customerName: string;
  customerCode: string;
  priority: "normal" | "high" | "urgent";
  requiredDeliveryDate: string | null;
  poStatus: string;
  createdByName: string | null;
  items: FulfilmentWorkspaceItem[];
  traceability: FulfilmentTraceabilityLink[];
}

export type { ServiceResult };
