import type { VendorStatus, PurchaseOrderDbStatus, QaqcResult } from "@/types/database";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export interface VendorInput {
  vendorCode: string;
  vendorName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  status: VendorStatus;
  notes: string;
}

export interface VendorRecord {
  id: string;
  vendorCode: string;
  vendorName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: VendorStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderStatus =
  | "draft"
  | "issued"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled"
  | "awaiting_verification"
  | "confirmed";

export interface PurchaseOrderItemInput {
  productSpecies: string;
  orderedQuantity: number;
  unit: string;
  notes: string;
}

export interface PurchaseOrderInput {
  poNumber: string;
  vendorId: string;
  poDate: string;
  expectedDate: string;
  notes: string;
  status?: Extract<PurchaseOrderStatus, "draft" | "issued">;
  items: PurchaseOrderItemInput[];
}

export interface PurchaseOrderItemRecord {
  id: string;
  purchaseOrderId: string;
  productSpecies: string;
  orderedQuantity: number;
  unit: string;
  notes: string | null;
  receivedQuantity: number;
  remainingQuantity: number;
}

export interface PurchaseOrderListItem {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  poDate: string;
  expectedDate: string | null;
  itemCount: number;
  status: PurchaseOrderStatus;
  createdByName: string | null;
  createdAt: string;
}

export interface PurchaseOrderDetail {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  poDate: string;
  expectedDate: string | null;
  status: PurchaseOrderStatus;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  items: PurchaseOrderItemRecord[];
}

export interface ReceivingLineInput {
  purchaseOrderItemId: string;
  receivedQuantity: number;
  unit: string;
  notes: string;
}

export interface CompleteReceivingInput {
  purchaseOrderId: string;
  receiptNumber: string;
  receivedAt: string;
  driverName: string;
  vehicleNumber: string;
  notes: string;
  items: ReceivingLineInput[];
  qaqc: {
    inspectionDate: string;
    result: Extract<QaqcResult, "passed" | "failed" | "conditional">;
    notes: string;
  };
  allowOverReceive: boolean;
}

export interface GoodsReceiptListItem {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  vendorName: string;
  receivedAt: string;
  driverName: string | null;
  vehicleNumber: string | null;
  status: string;
}

export interface GoodsReceiptDetail {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  vendorName: string;
  receivedAt: string;
  driverName: string | null;
  vehicleNumber: string | null;
  notes: string | null;
  status: string;
  items: Array<{
    id: string;
    productSpecies: string;
    receivedQuantity: number;
    unit: string;
    notes: string | null;
  }>;
  qaqc: {
    id: string;
    inspectionDate: string;
    result: string | null;
    notes: string | null;
    status: string;
  } | null;
  batches: Array<{
    id: string;
    batchNumber: string;
    productSpecies: string;
    receivedQuantity: number;
    unit: string;
  }>;
}

export type FreshWindowStatus = "fresh" | "approaching_deadline" | "expired_ready_for_frozen";

export interface BatchListItem {
  id: string;
  batchNumber: string;
  productSpecies: string;
  receivedQuantity: number;
  remainingQuantity: number;
  unit: string;
  receivedAt: string;
  freshUntil: string;
  freshStatus: FreshWindowStatus;
  status: string;
  vendorName: string;
}

export interface BatchProcessingSummary {
  id: string;
  processingRunNumber: string;
  processingDate: string;
  inputQuantity: number;
  yieldQuantity: number;
  wastageQuantity: number;
  unit: string;
  status: string;
  qaqcResult: string | null;
}

export interface BatchDetail {
  id: string;
  batchNumber: string;
  productSpecies: string;
  receivedQuantity: number;
  remainingQuantity: number;
  unit: string;
  receivedAt: string;
  freshUntil: string;
  freshStatus: FreshWindowStatus;
  status: string;
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  goodsReceiptId: string;
  receiptNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  qaqcResult: string | null;
  inventoryItemId: string | null;
  inventoryQuantity: number | null;
  inventoryType: string | null;
  processingRuns: BatchProcessingSummary[];
}

export type { PurchaseOrderDbStatus, VendorStatus };
