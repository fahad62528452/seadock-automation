/**
 * A batch number is assigned when goods are received and stays the identity
 * of that lot through processing, QAQC, and fulfilment.
 */
export type BatchNumber = string;

export type QuantityKg = number;

export const TRACE_STAGES = [
  "vendor",
  "purchase_order",
  "goods_receipt",
  "incoming_qaqc",
  "batch",
  "processing_run",
  "yield_wastage",
  "processed_inventory",
  "customer_po",
  "final_qaqc",
  "fulfilment",
] as const;

export type TraceStage = (typeof TRACE_STAGES)[number];

export interface TraceLink {
  batchNumber: BatchNumber;
  stage: TraceStage;
  recordId: string;
  occurredAt: string;
}

export interface Vendor {
  id: string;
  code: string;
  name: string;
}

export type PurchaseOrderStatus =
  | "draft"
  | "awaiting_verification"
  | "confirmed"
  | "partially_received"
  | "received"
  | "cancelled";

export interface PurchaseOrder {
  id: string;
  number: string;
  vendorId: string;
  status: PurchaseOrderStatus;
  orderedAt: string;
}

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId: string;
  description: string;
  orderedQuantityKg: QuantityKg;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  purchaseOrderId: string;
  vendorId: string;
  batchNumber: BatchNumber;
  receivedQuantityKg: QuantityKg;
  receivedAt: string;
}

export type QaqcStatus = "pending" | "passed" | "failed" | "on_hold";

export interface IncomingQaqc {
  id: string;
  batchNumber: BatchNumber;
  goodsReceiptId: string;
  status: QaqcStatus;
}

export type BatchState = "fresh" | "frozen" | "in_processing" | "processed" | "dispatched";

export interface Batch {
  id: string;
  batchNumber: BatchNumber;
  vendorId: string;
  purchaseOrderId: string;
  goodsReceiptId: string;
  state: BatchState;
  quantityKg: QuantityKg;
}

export type ProcessingRunStatus = "pending" | "in_progress" | "completed";

export interface ProcessingRun {
  id: string;
  batchNumber: BatchNumber;
  status: ProcessingRunStatus;
  startedAt: string | null;
}

export interface YieldRecord {
  id: string;
  processingRunId: string;
  batchNumber: BatchNumber;
  inputKg: QuantityKg;
  outputKg: QuantityKg;
  wastageKg: QuantityKg;
}

export interface ProcessedInventory {
  id: string;
  batchNumber: BatchNumber;
  processingRunId: string;
  quantityKg: QuantityKg;
}

export type InventoryMovementKind =
  | "receipt"
  | "transfer"
  | "processing_input"
  | "processing_output"
  | "dispatch"
  | "adjustment";

export interface InventoryMovement {
  id: string;
  batchNumber: BatchNumber;
  kind: InventoryMovementKind;
  quantityKg: QuantityKg;
  occurredAt: string;
}

export type CustomerPoStatus =
  | "awaiting_verification"
  | "pending_fulfilment"
  | "fulfilled"
  | "cancelled";

export interface CustomerPurchaseOrder {
  id: string;
  number: string;
  customerName: string;
  status: CustomerPoStatus;
  receivedAt: string;
}

export interface CustomerPurchaseOrderLine {
  id: string;
  customerPurchaseOrderId: string;
  description: string;
  quantityKg: QuantityKg;
  batchNumber: BatchNumber | null;
}

export interface FinalQaqc {
  id: string;
  batchNumber: BatchNumber;
  customerPurchaseOrderId: string;
  status: QaqcStatus;
}

export interface Fulfilment {
  id: string;
  customerPurchaseOrderId: string;
  batchNumber: BatchNumber;
  dispatchedAt: string | null;
}
