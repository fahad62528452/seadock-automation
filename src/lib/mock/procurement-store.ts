import { getFreshUntil, getFreshWindowStatus } from "@/lib/fresh-window";
import {
  getInventoryOriginAt,
  getLifecycleState,
  isEligibleForFreeze,
} from "@/lib/inventory-lifecycle";
import { percentOf, quantityGreaterThan, quantitiesEqual, roundQuantity } from "@/lib/quantity";
import type { InventoryType } from "@/types/database";
import type {
  BatchInventorySummary,
  FreezeResult,
  InventoryBalanceSummary,
  InventoryItemDetail,
  InventoryListFilters,
  InventoryListItem,
  InventoryMovementFilters,
  InventoryMovementListItem,
} from "@/types/inventory";
import type {
  BatchDetail,
  BatchListItem,
  CompleteReceivingInput,
  GoodsReceiptDetail,
  GoodsReceiptListItem,
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderListItem,
  VendorInput,
  VendorRecord,
} from "@/types/procurement";
import type {
  BatchProcessingHistoryItem,
  EligibleBatchOption,
  ProcessingRunDetail,
  ProcessingRunInput,
  ProcessingRunListItem,
} from "@/types/processing";

type MockVendor = VendorRecord;
type MockPoItem = {
  id: string;
  purchaseOrderId: string;
  productSpecies: string;
  orderedQuantity: number;
  unit: string;
  notes: string | null;
};
type MockPo = {
  id: string;
  poNumber: string;
  vendorId: string;
  poDate: string;
  expectedDate: string | null;
  status: PurchaseOrderListItem["status"];
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};
type MockReceipt = {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  receivedAt: string;
  driverName: string;
  vehicleNumber: string;
  notes: string | null;
  status: string;
  createdAt: string;
};
type MockReceiptItem = {
  id: string;
  goodsReceiptId: string;
  purchaseOrderItemId: string;
  receivedQuantity: number;
  unit: string;
  notes: string | null;
};
type MockQaqc = {
  id: string;
  goodsReceiptId: string;
  batchId: string | null;
  inspectionDate: string;
  result: string;
  notes: string | null;
  status: string;
};
type MockBatch = {
  id: string;
  batchNumber: string;
  goodsReceiptId: string;
  goodsReceiptItemId: string | null;
  productSpecies: string;
  receivedQuantity: number;
  remainingQuantity: number;
  unit: string;
  receivedAt: string;
  status: string;
};
type MockInventory = {
  id: string;
  batchId: string;
  processingRunId: string | null;
  inventoryType: string;
  productSpecies: string;
  quantity: number;
  reservedQuantity: number;
  unit: string;
  status: string;
  createdAt: string;
  frozenAt: string | null;
};
type MockMovement = {
  id: string;
  inventoryItemId: string;
  movementType: string;
  quantity: number;
  unit: string;
  referenceType: string;
  referenceId: string;
  previousQuantity: number;
  newQuantity: number;
  performedAt: string;
  notes: string | null;
};
type MockAudit = {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string;
};
type MockProcessingRun = {
  id: string;
  processingRunNumber: string;
  parentBatchId: string;
  processingDate: string;
  inputQuantity: number;
  inputUnit: string;
  processedQuantity: number;
  wastageQuantity: number;
  status: ProcessingRunListItem["status"];
  operatorName: string | null;
  notes: string | null;
  createdAt: string;
  inventoryAccepted: boolean;
};
type MockProcessingQaqc = {
  id: string;
  processingRunId: string;
  batchId: string;
  inspectionDate: string;
  result: string;
  notes: string | null;
  status: string;
};

type Store = {
  vendors: MockVendor[];
  purchaseOrders: MockPo[];
  purchaseOrderItems: MockPoItem[];
  goodsReceipts: MockReceipt[];
  goodsReceiptItems: MockReceiptItem[];
  incomingQaqc: MockQaqc[];
  batches: MockBatch[];
  inventoryItems: MockInventory[];
  inventoryMovements: MockMovement[];
  audits: MockAudit[];
  processingRuns: MockProcessingRun[];
  processingQaqc: MockProcessingQaqc[];
  batchCounter: number;
  processingRunCounter: number;
};

const globalStore = globalThis as typeof globalThis & { __seadockMockStore?: Store };

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getStore(): Store {
  if (!globalStore.__seadockMockStore) {
    globalStore.__seadockMockStore = {
      vendors: [],
      purchaseOrders: [],
      purchaseOrderItems: [],
      goodsReceipts: [],
      goodsReceiptItems: [],
      incomingQaqc: [],
      batches: [],
      inventoryItems: [],
      inventoryMovements: [],
      audits: [],
      processingRuns: [],
      processingQaqc: [],
      batchCounter: 0,
      processingRunCounter: 0,
    };
  }
  const store = globalStore.__seadockMockStore;
  store.processingRuns ??= [];
  store.processingQaqc ??= [];
  store.processingRunCounter ??= 0;
  seedProcessedInventory(store);
  seedInventoryLifecycle(store);
  return store;
}

/**
 * Stable processed inventory used to exercise the Step 7 fulfilment workflow in mock mode.
 * Idempotent: safe to call on every store access.
 */
function seedProcessedInventory(store: Store) {
  if (store.batches.some((batch) => batch.id === "batch_0012")) return;

  const receivedAt = "2026-11-08T06:30:00.000Z";
  const processedAt = "2026-11-09T09:00:00.000Z";
  const vendorId = "vendor_seed_001";

  store.vendors.push({
    id: vendorId,
    vendorCode: "VND-SEED-1",
    vendorName: "Gulf Fisheries Supply",
    contactPerson: "Omar Said",
    phone: "+971-4-000-1111",
    email: "supply@gulf-fisheries.test",
    address: "Port Rashid, Dubai",
    status: "active",
    notes: "Seed vendor for fulfilment development",
    createdAt: receivedAt,
    updatedAt: receivedAt,
  });
  store.purchaseOrders.push({
    id: "po_seed_001",
    poNumber: "VPO-SEED-001",
    vendorId,
    poDate: "2026-11-06",
    expectedDate: "2026-11-08",
    status: "received",
    notes: null,
    createdByName: "System",
    createdAt: receivedAt,
    updatedAt: receivedAt,
  });
  store.purchaseOrderItems.push({
    id: "poi_seed_001",
    purchaseOrderId: "po_seed_001",
    productSpecies: "Frozen Fish Fillet",
    orderedQuantity: 740,
    unit: "kg",
    notes: null,
  });
  store.goodsReceipts.push({
    id: "gr_seed_001",
    receiptNumber: "GR-SEED-001",
    purchaseOrderId: "po_seed_001",
    receivedAt,
    driverName: "Hassan",
    vehicleNumber: "DXB-12345",
    notes: null,
    status: "accepted",
    createdAt: receivedAt,
  });

  const seeds = [
    { suffix: "0012", number: 12, received: 400, yieldQty: 300, wastageQty: 100, run: 1 },
    { suffix: "0018", number: 18, received: 340, yieldQty: 250, wastageQty: 90, run: 2 },
  ];

  for (const seed of seeds) {
    const batchId = `batch_${seed.suffix}`;
    const batchNumber = `BATCH-2026-${String(seed.number).padStart(5, "0")}`;
    const runId = `run_seed_${seed.suffix}`;
    const receiptItemId = `gri_seed_${seed.suffix}`;

    store.goodsReceiptItems.push({
      id: receiptItemId,
      goodsReceiptId: "gr_seed_001",
      purchaseOrderItemId: "poi_seed_001",
      receivedQuantity: seed.received,
      unit: "kg",
      notes: null,
    });
    store.batches.push({
      id: batchId,
      batchNumber,
      goodsReceiptId: "gr_seed_001",
      goodsReceiptItemId: receiptItemId,
      productSpecies: "Frozen Fish Fillet",
      receivedQuantity: seed.received,
      remainingQuantity: 0,
      unit: "kg",
      receivedAt,
      status: "processed",
    });
    store.incomingQaqc.push({
      id: `qaqc_in_seed_${seed.suffix}`,
      goodsReceiptId: "gr_seed_001",
      batchId,
      inspectionDate: "2026-11-08",
      result: "passed",
      notes: null,
      status: "completed",
    });
    store.processingRuns.push({
      id: runId,
      processingRunNumber: `RUN-2026-${String(seed.run).padStart(5, "0")}`,
      parentBatchId: batchId,
      processingDate: "2026-11-09",
      inputQuantity: seed.received,
      inputUnit: "kg",
      processedQuantity: seed.yieldQty,
      wastageQuantity: seed.wastageQty,
      status: "completed",
      operatorName: "Yusuf Rahman",
      notes: null,
      createdAt: processedAt,
      inventoryAccepted: true,
    });
    store.processingQaqc.push({
      id: `qaqc_proc_seed_${seed.suffix}`,
      processingRunId: runId,
      batchId,
      inspectionDate: "2026-11-09",
      result: "passed",
      notes: null,
      status: "completed",
    });

    const rawId = `inv_raw_${seed.suffix}`;
    store.inventoryItems.push(
      {
        id: rawId,
        batchId,
        processingRunId: null,
        inventoryType: "raw",
        productSpecies: "Frozen Fish Fillet",
        quantity: 0,
        reservedQuantity: 0,
        unit: "kg",
        status: "available",
        createdAt: receivedAt,
        frozenAt: null,
      },
      {
        id: `inv_proc_${seed.suffix}`,
        batchId,
        processingRunId: runId,
        inventoryType: "processed",
        productSpecies: "Frozen Fish Fillet",
        quantity: seed.yieldQty,
        reservedQuantity: 0,
        unit: "kg",
        status: "available",
        createdAt: processedAt,
        frozenAt: null,
      },
      {
        id: `inv_waste_${seed.suffix}`,
        batchId,
        processingRunId: runId,
        inventoryType: "wastage",
        productSpecies: "Frozen Fish Fillet",
        quantity: seed.wastageQty,
        reservedQuantity: 0,
        unit: "kg",
        status: "available",
        createdAt: processedAt,
        frozenAt: null,
      },
    );
    store.inventoryMovements.push(
      {
        id: `move_seed_receipt_${seed.suffix}`,
        inventoryItemId: rawId,
        movementType: "receipt",
        quantity: seed.received,
        unit: "kg",
        referenceType: "goods_receipt",
        referenceId: "gr_seed_001",
        previousQuantity: 0,
        newQuantity: seed.received,
        performedAt: receivedAt,
        notes: "Initial inventory from goods receipt",
      },
      {
        id: `move_seed_consume_${seed.suffix}`,
        inventoryItemId: rawId,
        movementType: "processing_consumption",
        quantity: -seed.received,
        unit: "kg",
        referenceType: "processing_run",
        referenceId: runId,
        previousQuantity: seed.received,
        newQuantity: 0,
        performedAt: processedAt,
        notes: "Raw inventory consumed by processing",
      },
      {
        id: `move_seed_yield_${seed.suffix}`,
        inventoryItemId: `inv_proc_${seed.suffix}`,
        movementType: "processing_yield",
        quantity: seed.yieldQty,
        unit: "kg",
        referenceType: "processing_run",
        referenceId: runId,
        previousQuantity: 0,
        newQuantity: seed.yieldQty,
        performedAt: processedAt,
        notes: "Processed yield from processing run",
      },
    );
  }

  store.batchCounter = Math.max(store.batchCounter, 18);
  store.processingRunCounter = Math.max(store.processingRunCounter, 2);
}

/**
 * Seed rows that showcase fresh / frozen / wastage lifecycle classes for Step 8 verification.
 */
function seedInventoryLifecycle(store: Store) {
  if (store.batches.some((batch) => batch.id === "batch_lifecycle_001")) return;

  const receivedAt = "2026-11-05T08:00:00.000Z";
  const recentProcessedAt = "2026-11-12T10:00:00.000Z";
  const frozenAt = "2026-11-07T12:00:00.000Z";
  const batchId = "batch_lifecycle_001";

  store.batches.push({
    id: batchId,
    batchNumber: "BATCH-LIFE-001",
    goodsReceiptId: "gr_seed_001",
    goodsReceiptItemId: null,
    productSpecies: "Silver Pomfret",
    receivedQuantity: 200,
    remainingQuantity: 80,
    unit: "kg",
    receivedAt,
    status: "fresh",
  });

  store.inventoryItems.push(
    {
      id: "inv_raw_lifecycle",
      batchId,
      processingRunId: null,
      inventoryType: "raw",
      productSpecies: "Silver Pomfret",
      quantity: 80,
      reservedQuantity: 0,
      unit: "kg",
      status: "available",
      createdAt: receivedAt,
      frozenAt: null,
    },
    {
      id: "inv_proc_lifecycle_fresh",
      batchId,
      processingRunId: "run_lifecycle_demo",
      inventoryType: "processed",
      productSpecies: "Silver Pomfret",
      quantity: 45,
      reservedQuantity: 0,
      unit: "kg",
      status: "available",
      createdAt: recentProcessedAt,
      frozenAt: null,
    },
    {
      id: "inv_frozen_lifecycle",
      batchId,
      processingRunId: "run_lifecycle_demo",
      inventoryType: "frozen",
      productSpecies: "Silver Pomfret",
      quantity: 60,
      reservedQuantity: 0,
      unit: "kg",
      status: "available",
      createdAt: receivedAt,
      frozenAt,
    },
    {
      id: "inv_wastage_lifecycle",
      batchId,
      processingRunId: "run_lifecycle_demo",
      inventoryType: "wastage",
      productSpecies: "Silver Pomfret",
      quantity: 15,
      reservedQuantity: 0,
      unit: "kg",
      status: "available",
      createdAt: receivedAt,
      frozenAt: null,
    },
  );

  store.inventoryMovements.push({
    id: "move_lifecycle_receipt",
    inventoryItemId: "inv_raw_lifecycle",
    movementType: "receipt",
    quantity: 80,
    unit: "kg",
    referenceType: "goods_receipt",
    referenceId: "gr_seed_001",
    previousQuantity: 0,
    newQuantity: 80,
    performedAt: receivedAt,
    notes: "Lifecycle demo raw receipt",
  });
}

export type MockInventoryItem = MockInventory;
export type MockBatchRow = MockBatch;
export type MockInventoryMovement = MockMovement;

/** Live references for the fulfilment store. Inventory stays owned by this module's store. */
export function getMockInventoryContext() {
  const store = getStore();
  return {
    batches: store.batches,
    inventoryItems: store.inventoryItems,
    inventoryMovements: store.inventoryMovements,
    processingRuns: store.processingRuns,
    createId,
    nowIso,
  };
}

function nextProcessingRunNumber(store: Store): string {
  store.processingRunCounter += 1;
  const year = new Date().getUTCFullYear();
  return `RUN-${year}-${String(store.processingRunCounter).padStart(5, "0")}`;
}

function rawInventoryForBatch(store: Store, batchId: string): MockInventory | undefined {
  return store.inventoryItems.find(
    (row) => row.batchId === batchId && row.inventoryType === "raw" && row.status === "available",
  );
}

function pushAudit(
  store: Store,
  input: {
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    entityLabel: string;
    field?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
  },
) {
  store.audits.unshift({
    id: createId("audit"),
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    field: input.field ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    timestamp: nowIso(),
  });
}

function receivedForItem(store: Store, itemId: string): number {
  return store.goodsReceiptItems
    .filter((item) => item.purchaseOrderItemId === itemId)
    .filter((item) => {
      const receipt = store.goodsReceipts.find((row) => row.id === item.goodsReceiptId);
      return receipt && ["accepted", "received", "pending_qaqc"].includes(receipt.status);
    })
    .reduce((sum, item) => sum + item.receivedQuantity, 0);
}

function nextBatchNumber(store: Store): string {
  store.batchCounter += 1;
  const year = new Date().getUTCFullYear();
  return `BATCH-${year}-${String(store.batchCounter).padStart(5, "0")}`;
}

export function mockListVendors(): VendorRecord[] {
  return [...getStore().vendors].sort((a, b) => a.vendorCode.localeCompare(b.vendorCode));
}

export function mockGetVendor(id: string): VendorRecord | null {
  return getStore().vendors.find((vendor) => vendor.id === id) ?? null;
}

export function mockCreateVendor(input: VendorInput, actorName: string): VendorRecord {
  const store = getStore();
  if (store.vendors.some((vendor) => vendor.vendorCode.toLowerCase() === input.vendorCode.trim().toLowerCase())) {
    throw new Error("A vendor with this code already exists.");
  }

  const timestamp = nowIso();
  const vendor: VendorRecord = {
    id: createId("vendor"),
    vendorCode: input.vendorCode.trim(),
    vendorName: input.vendorName.trim(),
    contactPerson: input.contactPerson.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    address: input.address.trim() || null,
    status: input.status,
    notes: input.notes.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.vendors.push(vendor);
  pushAudit(store, {
    actorName,
    action: "Vendor Created",
    entityType: "vendor",
    entityId: vendor.id,
    entityLabel: vendor.vendorCode,
    field: "vendor_code",
    newValue: vendor.vendorCode,
  });
  return vendor;
}

export function mockUpdateVendor(id: string, input: VendorInput, actorName: string): VendorRecord {
  const store = getStore();
  const existing = store.vendors.find((vendor) => vendor.id === id);
  if (!existing) throw new Error("Vendor not found.");

  if (
    store.vendors.some(
      (vendor) =>
        vendor.id !== id && vendor.vendorCode.toLowerCase() === input.vendorCode.trim().toLowerCase(),
    )
  ) {
    throw new Error("A vendor with this code already exists.");
  }

  const previousName = existing.vendorName;
  existing.vendorCode = input.vendorCode.trim();
  existing.vendorName = input.vendorName.trim();
  existing.contactPerson = input.contactPerson.trim() || null;
  existing.phone = input.phone.trim() || null;
  existing.email = input.email.trim() || null;
  existing.address = input.address.trim() || null;
  existing.status = input.status;
  existing.notes = input.notes.trim() || null;
  existing.updatedAt = nowIso();

  pushAudit(store, {
    actorName,
    action: "Vendor Updated",
    entityType: "vendor",
    entityId: existing.id,
    entityLabel: existing.vendorCode,
    field: "vendor_name",
    previousValue: previousName,
    newValue: existing.vendorName,
  });
  return existing;
}

export function mockListPurchaseOrders(): PurchaseOrderListItem[] {
  const store = getStore();
  return store.purchaseOrders
    .map((po) => {
      const vendor = store.vendors.find((row) => row.id === po.vendorId);
      return {
        id: po.id,
        poNumber: po.poNumber,
        vendorId: po.vendorId,
        vendorName: vendor?.vendorName ?? "Unknown vendor",
        poDate: po.poDate,
        expectedDate: po.expectedDate,
        itemCount: store.purchaseOrderItems.filter((item) => item.purchaseOrderId === po.id).length,
        status: po.status,
        createdByName: po.createdByName,
        createdAt: po.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function mockGetPurchaseOrder(id: string): PurchaseOrderDetail | null {
  const store = getStore();
  const po = store.purchaseOrders.find((row) => row.id === id);
  if (!po) return null;
  const vendor = store.vendors.find((row) => row.id === po.vendorId);
  const items = store.purchaseOrderItems
    .filter((item) => item.purchaseOrderId === po.id)
    .map((item) => {
      const receivedQuantity = receivedForItem(store, item.id);
      return {
        id: item.id,
        purchaseOrderId: item.purchaseOrderId,
        productSpecies: item.productSpecies,
        orderedQuantity: item.orderedQuantity,
        unit: item.unit,
        notes: item.notes,
        receivedQuantity,
        remainingQuantity: Math.max(item.orderedQuantity - receivedQuantity, 0),
      };
    });

  return {
    id: po.id,
    poNumber: po.poNumber,
    vendorId: po.vendorId,
    vendorName: vendor?.vendorName ?? "Unknown vendor",
    vendorCode: vendor?.vendorCode ?? "",
    poDate: po.poDate,
    expectedDate: po.expectedDate,
    status: po.status,
    notes: po.notes,
    createdByName: po.createdByName,
    createdAt: po.createdAt,
    items,
  };
}

export function mockCreatePurchaseOrder(
  input: PurchaseOrderInput,
  actorName: string,
): PurchaseOrderDetail {
  const store = getStore();
  if (store.purchaseOrders.some((po) => po.poNumber.toLowerCase() === input.poNumber.trim().toLowerCase())) {
    throw new Error("A purchase order with this number already exists.");
  }
  if (!store.vendors.some((vendor) => vendor.id === input.vendorId)) {
    throw new Error("Selected vendor was not found.");
  }

  const timestamp = nowIso();
  const po: MockPo = {
    id: createId("po"),
    poNumber: input.poNumber.trim(),
    vendorId: input.vendorId,
    poDate: input.poDate,
    expectedDate: input.expectedDate.trim() || null,
    status: input.status ?? "issued",
    notes: input.notes.trim() || null,
    createdByName: actorName,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.purchaseOrders.push(po);

  for (const item of input.items) {
    store.purchaseOrderItems.push({
      id: createId("poi"),
      purchaseOrderId: po.id,
      productSpecies: item.productSpecies.trim(),
      orderedQuantity: item.orderedQuantity,
      unit: item.unit.trim() || "kg",
      notes: item.notes.trim() || null,
    });
  }

  pushAudit(store, {
    actorName,
    action: "PO Created",
    entityType: "purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "status",
    newValue: po.status,
  });

  const detail = mockGetPurchaseOrder(po.id);
  if (!detail) throw new Error("Failed to load created purchase order.");
  return detail;
}

export function mockListGoodsReceipts(): GoodsReceiptListItem[] {
  const store = getStore();
  return store.goodsReceipts
    .map((receipt) => {
      const po = store.purchaseOrders.find((row) => row.id === receipt.purchaseOrderId);
      const vendor = store.vendors.find((row) => row.id === po?.vendorId);
      return {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        purchaseOrderId: receipt.purchaseOrderId,
        poNumber: po?.poNumber ?? "Unknown PO",
        vendorName: vendor?.vendorName ?? "Unknown vendor",
        receivedAt: receipt.receivedAt,
        driverName: receipt.driverName,
        vehicleNumber: receipt.vehicleNumber,
        status: receipt.status,
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function mockGetGoodsReceipt(id: string): GoodsReceiptDetail | null {
  const store = getStore();
  const receipt = store.goodsReceipts.find((row) => row.id === id);
  if (!receipt) return null;
  const po = store.purchaseOrders.find((row) => row.id === receipt.purchaseOrderId);
  const vendor = store.vendors.find((row) => row.id === po?.vendorId);
  const qaqc = store.incomingQaqc.find((row) => row.goodsReceiptId === receipt.id) ?? null;
  const items = store.goodsReceiptItems
    .filter((item) => item.goodsReceiptId === receipt.id)
    .map((item) => {
      const poItem = store.purchaseOrderItems.find((row) => row.id === item.purchaseOrderItemId);
      return {
        id: item.id,
        productSpecies: poItem?.productSpecies ?? "Unknown",
        receivedQuantity: item.receivedQuantity,
        unit: item.unit,
        notes: item.notes,
      };
    });
  const batches = store.batches
    .filter((batch) => batch.goodsReceiptId === receipt.id)
    .map((batch) => ({
      id: batch.id,
      batchNumber: batch.batchNumber,
      productSpecies: batch.productSpecies,
      receivedQuantity: batch.receivedQuantity,
      unit: batch.unit,
    }));

  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    purchaseOrderId: receipt.purchaseOrderId,
    poNumber: po?.poNumber ?? "Unknown PO",
    vendorName: vendor?.vendorName ?? "Unknown vendor",
    receivedAt: receipt.receivedAt,
    driverName: receipt.driverName,
    vehicleNumber: receipt.vehicleNumber,
    notes: receipt.notes,
    status: receipt.status,
    items,
    qaqc: qaqc
      ? {
          id: qaqc.id,
          inspectionDate: qaqc.inspectionDate,
          result: qaqc.result,
          notes: qaqc.notes,
          status: qaqc.status,
        }
      : null,
    batches,
  };
}

export function mockCompleteReceiving(input: CompleteReceivingInput, actorName: string) {
  const store = getStore();
  if (store.goodsReceipts.some((row) => row.receiptNumber.toLowerCase() === input.receiptNumber.trim().toLowerCase())) {
    throw new Error("A goods receipt with this number already exists.");
  }

  const po = store.purchaseOrders.find((row) => row.id === input.purchaseOrderId);
  if (!po) throw new Error("Purchase order not found.");
  if (["draft", "cancelled", "closed"].includes(po.status)) {
    throw new Error("Purchase order is not open for receiving.");
  }

  const positiveItems = input.items.filter((item) => item.receivedQuantity > 0);
  if (!positiveItems.length) throw new Error("Enter at least one receiving quantity greater than zero.");

  for (const line of positiveItems) {
    const poItem = store.purchaseOrderItems.find(
      (item) => item.id === line.purchaseOrderItemId && item.purchaseOrderId === po.id,
    );
    if (!poItem) throw new Error("Purchase order item not found for this PO.");
    const previously = receivedForItem(store, poItem.id);
    const remaining = poItem.orderedQuantity - previously;
    if (line.receivedQuantity > remaining && !input.allowOverReceive) {
      throw new Error(`Receiving quantity for ${poItem.productSpecies} exceeds remaining quantity.`);
    }
  }

  const accept = ["passed", "conditional"].includes(input.qaqc.result);
  const receipt: MockReceipt = {
    id: createId("gr"),
    receiptNumber: input.receiptNumber.trim(),
    purchaseOrderId: po.id,
    receivedAt: input.receivedAt,
    driverName: input.driverName.trim(),
    vehicleNumber: input.vehicleNumber.trim(),
    notes: input.notes.trim() || null,
    status: accept ? "accepted" : "rejected",
    createdAt: nowIso(),
  };
  store.goodsReceipts.push(receipt);

  const createdBatchIds: string[] = [];

  for (const line of positiveItems) {
    const poItem = store.purchaseOrderItems.find((item) => item.id === line.purchaseOrderItemId)!;
    const receiptItem: MockReceiptItem = {
      id: createId("gri"),
      goodsReceiptId: receipt.id,
      purchaseOrderItemId: poItem.id,
      receivedQuantity: line.receivedQuantity,
      unit: line.unit.trim() || poItem.unit,
      notes: line.notes.trim() || null,
    };
    store.goodsReceiptItems.push(receiptItem);

    if (!accept) continue;

    const batch: MockBatch = {
      id: createId("batch"),
      batchNumber: nextBatchNumber(store),
      goodsReceiptId: receipt.id,
      goodsReceiptItemId: receiptItem.id,
      productSpecies: poItem.productSpecies,
      receivedQuantity: line.receivedQuantity,
      remainingQuantity: line.receivedQuantity,
      unit: receiptItem.unit,
      receivedAt: receipt.receivedAt,
      status: "fresh",
    };
    store.batches.push(batch);
    createdBatchIds.push(batch.id);

    const inventory: MockInventory = {
      id: createId("inv"),
      batchId: batch.id,
      processingRunId: null,
      inventoryType: "raw",
      productSpecies: batch.productSpecies,
      quantity: batch.receivedQuantity,
      reservedQuantity: 0,
      unit: batch.unit,
      status: "available",
      createdAt: receipt.receivedAt,
      frozenAt: null,
    };
    store.inventoryItems.push(inventory);
    store.inventoryMovements.push({
      id: createId("move"),
      inventoryItemId: inventory.id,
      movementType: "receipt",
      quantity: inventory.quantity,
      unit: inventory.unit,
      referenceType: "goods_receipt",
      referenceId: receipt.id,
      previousQuantity: 0,
      newQuantity: inventory.quantity,
      performedAt: receipt.receivedAt,
      notes: "Initial inventory from goods receipt",
    });

    pushAudit(store, {
      actorName,
      action: "Batch Created",
      entityType: "batch",
      entityId: batch.id,
      entityLabel: batch.batchNumber,
      field: "batch_number",
      newValue: batch.batchNumber,
    });
    pushAudit(store, {
      actorName,
      action: "Initial Inventory Created",
      entityType: "inventory_item",
      entityId: inventory.id,
      entityLabel: batch.batchNumber,
      field: "quantity",
      previousValue: "0",
      newValue: `${inventory.quantity} ${inventory.unit}`,
    });
    pushAudit(store, {
      actorName,
      action: "Inventory Receipt Recorded",
      entityType: "inventory_movement",
      entityId: inventory.id,
      entityLabel: batch.batchNumber,
      field: "new_quantity",
      previousValue: "0",
      newValue: `${inventory.quantity} ${inventory.unit}`,
    });
  }

  const qaqc: MockQaqc = {
    id: createId("qaqc"),
    goodsReceiptId: receipt.id,
    batchId: createdBatchIds.length === 1 ? createdBatchIds[0] : null,
    inspectionDate: input.qaqc.inspectionDate,
    result: input.qaqc.result,
    notes: input.qaqc.notes.trim() || null,
    status: "completed",
  };
  store.incomingQaqc.push(qaqc);

  const totalOrdered = store.purchaseOrderItems
    .filter((item) => item.purchaseOrderId === po.id)
    .reduce((sum, item) => sum + item.orderedQuantity, 0);
  const totalReceived = store.purchaseOrderItems
    .filter((item) => item.purchaseOrderId === po.id)
    .reduce((sum, item) => sum + receivedForItem(store, item.id), 0);
  const previousStatus = po.status;
  po.status = totalReceived <= 0 ? po.status : totalReceived < totalOrdered ? "partially_received" : "received";
  po.updatedAt = nowIso();

  pushAudit(store, {
    actorName,
    action: "Goods Receipt Created",
    entityType: "goods_receipt",
    entityId: receipt.id,
    entityLabel: receipt.receiptNumber,
    field: "status",
    newValue: receipt.status,
  });
  pushAudit(store, {
    actorName,
    action: "Incoming QAQC Created",
    entityType: "incoming_qaqc",
    entityId: qaqc.id,
    entityLabel: receipt.receiptNumber,
    field: "result",
    newValue: qaqc.result,
  });
  pushAudit(store, {
    actorName,
    action: "PO Status Changed",
    entityType: "purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "status",
    previousValue: previousStatus,
    newValue: po.status,
  });

  if (input.allowOverReceive) {
    pushAudit(store, {
      actorName,
      action: "Goods Receipt Over-Receive Override",
      entityType: "goods_receipt",
      entityId: receipt.id,
      entityLabel: receipt.receiptNumber,
      field: "allow_over_receive",
      previousValue: "false",
      newValue: "true",
    });
  }

  return {
    goodsReceiptId: receipt.id,
    batchIds: createdBatchIds,
    accepted: accept,
  };
}

export function mockListBatches(): BatchListItem[] {
  const store = getStore();
  return store.batches
    .map((batch) => {
      const receipt = store.goodsReceipts.find((row) => row.id === batch.goodsReceiptId);
      const po = store.purchaseOrders.find((row) => row.id === receipt?.purchaseOrderId);
      const vendor = store.vendors.find((row) => row.id === po?.vendorId);
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        productSpecies: batch.productSpecies,
        receivedQuantity: batch.receivedQuantity,
        remainingQuantity: batch.remainingQuantity,
        unit: batch.unit,
        receivedAt: batch.receivedAt,
        freshUntil: getFreshUntil(batch.receivedAt),
        freshStatus: getFreshWindowStatus(batch.receivedAt),
        status: batch.status,
        vendorName: vendor?.vendorName ?? "Unknown vendor",
      };
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function mockGetBatch(id: string): BatchDetail | null {
  const store = getStore();
  const batch = store.batches.find((row) => row.id === id);
  if (!batch) return null;
  const receipt = store.goodsReceipts.find((row) => row.id === batch.goodsReceiptId);
  const po = store.purchaseOrders.find((row) => row.id === receipt?.purchaseOrderId);
  const vendor = store.vendors.find((row) => row.id === po?.vendorId);
  const qaqc = store.incomingQaqc.find((row) => row.goodsReceiptId === batch.goodsReceiptId) ?? null;
  const inventory =
    store.inventoryItems.find((row) => row.batchId === batch.id && row.inventoryType === "raw") ??
    store.inventoryItems.find((row) => row.batchId === batch.id) ??
    null;

  return {
    id: batch.id,
    batchNumber: batch.batchNumber,
    productSpecies: batch.productSpecies,
    receivedQuantity: batch.receivedQuantity,
    remainingQuantity: batch.remainingQuantity,
    unit: batch.unit,
    receivedAt: batch.receivedAt,
    freshUntil: getFreshUntil(batch.receivedAt),
    freshStatus: getFreshWindowStatus(batch.receivedAt),
    status: batch.status,
    vendorId: vendor?.id ?? "",
    vendorName: vendor?.vendorName ?? "Unknown vendor",
    vendorCode: vendor?.vendorCode ?? "",
    goodsReceiptId: batch.goodsReceiptId,
    receiptNumber: receipt?.receiptNumber ?? "",
    purchaseOrderId: po?.id ?? "",
    poNumber: po?.poNumber ?? "",
    qaqcResult: qaqc?.result ?? null,
    inventoryItemId: inventory?.id ?? null,
    inventoryQuantity: inventory?.quantity ?? null,
    inventoryType: inventory?.inventoryType ?? null,
    processingRuns: mockListBatchProcessingHistory(batch.id),
  };
}

export function mockListOpenPurchaseOrders(): PurchaseOrderDetail[] {
  return mockListPurchaseOrders()
    .filter((po) => ["issued", "partially_received", "confirmed", "awaiting_verification"].includes(po.status))
    .map((po) => mockGetPurchaseOrder(po.id))
    .filter((po): po is PurchaseOrderDetail => Boolean(po));
}

export function mockListEligibleBatches(): EligibleBatchOption[] {
  const store = getStore();
  return store.batches
    .map((batch) => {
      const raw = rawInventoryForBatch(store, batch.id);
      const available = raw ? roundQuantity(raw.quantity) : 0;
      if (available <= 0) return null;
      if (["archived", "dispatched"].includes(batch.status)) return null;
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        productSpecies: batch.productSpecies,
        availableQuantity: available,
        unit: raw?.unit ?? batch.unit,
        receivedAt: batch.receivedAt,
        status: batch.status,
        freshUntil: getFreshUntil(batch.receivedAt),
        freshStatus: getFreshWindowStatus(batch.receivedAt),
      } satisfies EligibleBatchOption;
    })
    .filter((row): row is EligibleBatchOption => Boolean(row))
    .sort((a, b) => a.batchNumber.localeCompare(b.batchNumber));
}

export function mockListBatchProcessingHistory(batchId: string): BatchProcessingHistoryItem[] {
  const store = getStore();
  return store.processingRuns
    .filter((run) => run.parentBatchId === batchId)
    .map((run) => {
      const qaqc = store.processingQaqc.find((row) => row.processingRunId === run.id);
      return {
        id: run.id,
        processingRunNumber: run.processingRunNumber,
        processingDate: run.processingDate,
        inputQuantity: run.inputQuantity,
        yieldQuantity: run.processedQuantity,
        wastageQuantity: run.wastageQuantity,
        unit: run.inputUnit,
        status: run.status,
        qaqcResult: qaqc?.result ?? null,
      };
    })
    .sort((a, b) => b.processingDate.localeCompare(a.processingDate) || b.processingRunNumber.localeCompare(a.processingRunNumber));
}

export function mockListProcessingRuns(): ProcessingRunListItem[] {
  const store = getStore();
  return store.processingRuns
    .map((run) => {
      const batch = store.batches.find((row) => row.id === run.parentBatchId);
      const qaqc = store.processingQaqc.find((row) => row.processingRunId === run.id);
      return {
        id: run.id,
        processingRunNumber: run.processingRunNumber,
        parentBatchId: run.parentBatchId,
        batchNumber: batch?.batchNumber ?? "—",
        productSpecies: batch?.productSpecies ?? "—",
        inputQuantity: run.inputQuantity,
        yieldQuantity: run.processedQuantity,
        wastageQuantity: run.wastageQuantity,
        yieldPercent: percentOf(run.processedQuantity, run.inputQuantity),
        wastagePercent: percentOf(run.wastageQuantity, run.inputQuantity),
        unit: run.inputUnit,
        processingDate: run.processingDate,
        status: run.status,
        operatorName: run.operatorName,
        qaqcResult: qaqc?.result ?? null,
        inventoryAccepted: run.inventoryAccepted,
      };
    })
    .sort((a, b) => b.processingDate.localeCompare(a.processingDate) || b.processingRunNumber.localeCompare(a.processingRunNumber));
}

export function mockGetProcessingRun(id: string): ProcessingRunDetail | null {
  const store = getStore();
  const run = store.processingRuns.find((row) => row.id === id);
  if (!run) return null;
  const batch = store.batches.find((row) => row.id === run.parentBatchId);
  const qaqc = store.processingQaqc.find((row) => row.processingRunId === run.id) ?? null;
  const processedInv = store.inventoryItems.find(
    (row) => row.processingRunId === run.id && row.inventoryType === "processed",
  );
  const wastageInv = store.inventoryItems.find(
    (row) => row.processingRunId === run.id && row.inventoryType === "wastage",
  );
  const audits = store.audits
    .filter((row) => row.entityId === run.id || row.entityLabel === run.processingRunNumber)
    .map((row) => ({
      id: row.id,
      actorName: row.actorName,
      action: row.action,
      field: row.field,
      previousValue: row.previousValue,
      newValue: row.newValue,
      timestamp: row.timestamp,
    }));

  return {
    id: run.id,
    processingRunNumber: run.processingRunNumber,
    parentBatchId: run.parentBatchId,
    batchNumber: batch?.batchNumber ?? "—",
    productSpecies: batch?.productSpecies ?? "—",
    processingDate: run.processingDate,
    operatorName: run.operatorName,
    status: run.status,
    notes: run.notes,
    inputQuantity: run.inputQuantity,
    yieldQuantity: run.processedQuantity,
    wastageQuantity: run.wastageQuantity,
    yieldPercent: percentOf(run.processedQuantity, run.inputQuantity),
    wastagePercent: percentOf(run.wastageQuantity, run.inputQuantity),
    unit: run.inputUnit,
    qaqc: qaqc
      ? {
          id: qaqc.id,
          inspectionDate: qaqc.inspectionDate,
          result: qaqc.result,
          notes: qaqc.notes,
          status: qaqc.status,
        }
      : null,
    inventoryImpact: {
      rawConsumed: run.inventoryAccepted ? run.inputQuantity : 0,
      processedCreated: processedInv?.quantity ?? (run.inventoryAccepted ? run.processedQuantity : 0),
      wastageCreated: wastageInv?.quantity ?? (run.inventoryAccepted ? run.wastageQuantity : 0),
      accepted: run.inventoryAccepted,
    },
    audits,
  };
}

export function mockCreateProcessingDraft(input: ProcessingRunInput, actorName: string) {
  const store = getStore();
  const inputQty = roundQuantity(input.inputQuantity);
  const batch = store.batches.find((row) => row.id === input.parentBatchId);
  if (!batch) throw new Error("Parent batch not found.");
  if (["archived", "dispatched"].includes(batch.status)) {
    throw new Error("This batch is not eligible for processing.");
  }
  const raw = rawInventoryForBatch(store, batch.id);
  if (!raw) throw new Error("No available raw inventory found for this batch.");
  if (quantityGreaterThan(inputQty, raw.quantity)) {
    throw new Error("Processing quantity cannot exceed available batch inventory.");
  }

  const run: MockProcessingRun = {
    id: createId("run"),
    processingRunNumber: nextProcessingRunNumber(store),
    parentBatchId: batch.id,
    processingDate: input.processingDate,
    inputQuantity: inputQty,
    inputUnit: input.unit.trim() || raw.unit,
    processedQuantity: 0,
    wastageQuantity: 0,
    status: "draft",
    operatorName: input.operatorName.trim(),
    notes: input.notes.trim() || null,
    createdAt: nowIso(),
    inventoryAccepted: false,
  };
  store.processingRuns.push(run);
  pushAudit(store, {
    actorName,
    action: "Processing Run Created",
    entityType: "processing_run",
    entityId: run.id,
    entityLabel: run.processingRunNumber,
    field: "status",
    newValue: "draft",
  });
  return { processingRunId: run.id, processingRunNumber: run.processingRunNumber, accepted: false };
}

export function mockCompleteProcessing(input: ProcessingRunInput, actorName: string) {
  const store = getStore();
  const inputQty = roundQuantity(input.inputQuantity);
  const yieldQty = roundQuantity(input.yieldQuantity);
  const wastageQty = roundQuantity(input.wastageQuantity);

  if (!quantitiesEqual(inputQty, yieldQty + wastageQty)) {
    throw new Error("Input quantity must equal yield quantity plus wastage quantity.");
  }

  const batch = store.batches.find((row) => row.id === input.parentBatchId);
  if (!batch) throw new Error("Parent batch not found.");
  if (["archived", "dispatched"].includes(batch.status)) {
    throw new Error("This batch is not eligible for processing.");
  }

  // Validation order mirrors complete_processing_workflow: raw availability before run status.
  const raw = rawInventoryForBatch(store, batch.id);
  if (!raw) throw new Error("No available raw inventory found for this batch.");
  if (quantityGreaterThan(inputQty, raw.quantity)) {
    throw new Error("Processing quantity cannot exceed available batch inventory.");
  }

  let run: MockProcessingRun | undefined;
  if (input.processingRunId) {
    run = store.processingRuns.find((row) => row.id === input.processingRunId);
    if (!run) throw new Error("Processing run not found.");
    if (run.status === "completed") throw new Error("Processing run is already completed.");
    if (run.status === "cancelled") throw new Error("Cancelled processing runs cannot be completed.");
    if (run.parentBatchId !== batch.id) throw new Error("Processing run does not belong to the selected batch.");
    run.processingDate = input.processingDate;
    run.operatorName = input.operatorName.trim();
    run.inputQuantity = inputQty;
    run.inputUnit = input.unit.trim() || raw.unit;
    run.processedQuantity = yieldQty;
    run.wastageQuantity = wastageQty;
    run.notes = input.notes.trim() || null;
    run.status = "completed";
    pushAudit(store, {
      actorName,
      action: "Processing Run Updated",
      entityType: "processing_run",
      entityId: run.id,
      entityLabel: run.processingRunNumber,
      field: "status",
      previousValue: "draft",
      newValue: "completed",
    });
  } else {
    run = {
      id: createId("run"),
      processingRunNumber: nextProcessingRunNumber(store),
      parentBatchId: batch.id,
      processingDate: input.processingDate,
      inputQuantity: inputQty,
      inputUnit: input.unit.trim() || raw.unit,
      processedQuantity: yieldQty,
      wastageQuantity: wastageQty,
      status: "completed",
      operatorName: input.operatorName.trim(),
      notes: input.notes.trim() || null,
      createdAt: nowIso(),
      inventoryAccepted: false,
    };
    store.processingRuns.push(run);
    pushAudit(store, {
      actorName,
      action: "Processing Run Created",
      entityType: "processing_run",
      entityId: run.id,
      entityLabel: run.processingRunNumber,
      field: "status",
      newValue: "completed",
    });
  }

  const qaqc: MockProcessingQaqc = {
    id: createId("pqaqc"),
    processingRunId: run.id,
    batchId: batch.id,
    inspectionDate: input.qaqc.inspectionDate,
    result: input.qaqc.result,
    notes: input.qaqc.notes.trim() || null,
    status: "completed",
  };
  store.processingQaqc.push(qaqc);
  pushAudit(store, {
    actorName,
    action: "Processing QAQC Created",
    entityType: "processing_qaqc",
    entityId: qaqc.id,
    entityLabel: run.processingRunNumber,
    field: "result",
    newValue: qaqc.result,
  });

  const accept = ["passed", "conditional"].includes(input.qaqc.result);
  if (!accept) {
    run.inventoryAccepted = false;
    pushAudit(store, {
      actorName,
      action: "Processing Run Completed",
      entityType: "processing_run",
      entityId: run.id,
      entityLabel: run.processingRunNumber,
      field: "inventory_accepted",
      previousValue: "pending",
      newValue: "false",
    });
    return {
      processingRunId: run.id,
      processingRunNumber: run.processingRunNumber,
      accepted: false,
    };
  }

  const previousRaw = raw.quantity;
  raw.quantity = roundQuantity(raw.quantity - inputQty);
  store.inventoryMovements.push({
    id: createId("move"),
    inventoryItemId: raw.id,
    movementType: "processing_consumption",
    quantity: -inputQty,
    unit: run.inputUnit,
    referenceType: "processing_run",
    referenceId: run.id,
    previousQuantity: previousRaw,
    newQuantity: raw.quantity,
    performedAt: nowIso(),
    notes: "Raw inventory consumed by processing",
  });

  let processedId: string | null = null;
  if (yieldQty > 0) {
    const processed: MockInventory = {
      id: createId("inv"),
      batchId: batch.id,
      processingRunId: run.id,
      inventoryType: "processed",
      productSpecies: batch.productSpecies,
      quantity: yieldQty,
      reservedQuantity: 0,
      unit: run.inputUnit,
      status: "available",
      createdAt: nowIso(),
      frozenAt: null,
    };
    store.inventoryItems.push(processed);
    processedId = processed.id;
    store.inventoryMovements.push({
      id: createId("move"),
      inventoryItemId: processed.id,
      movementType: "processing_yield",
      quantity: yieldQty,
      unit: run.inputUnit,
      referenceType: "processing_run",
      referenceId: run.id,
      previousQuantity: 0,
      newQuantity: yieldQty,
      performedAt: nowIso(),
      notes: "Processed yield from processing run",
    });
  }

  let wastageId: string | null = null;
  if (wastageQty > 0) {
    const wastage: MockInventory = {
      id: createId("inv"),
      batchId: batch.id,
      processingRunId: run.id,
      inventoryType: "wastage",
      productSpecies: batch.productSpecies,
      quantity: wastageQty,
      reservedQuantity: 0,
      unit: run.inputUnit,
      status: "available",
      createdAt: nowIso(),
      frozenAt: null,
    };
    store.inventoryItems.push(wastage);
    wastageId = wastage.id;
    store.inventoryMovements.push({
      id: createId("move"),
      inventoryItemId: wastage.id,
      movementType: "processing_wastage",
      quantity: wastageQty,
      unit: run.inputUnit,
      referenceType: "processing_run",
      referenceId: run.id,
      previousQuantity: 0,
      newQuantity: wastageQty,
      performedAt: nowIso(),
      notes: "Wastage inventory from processing run",
    });
  }

  batch.remainingQuantity = roundQuantity(Math.max(batch.remainingQuantity - inputQty, 0));
  batch.status = batch.remainingQuantity === 0 ? "processed" : "in_processing";
  run.inventoryAccepted = true;

  pushAudit(store, {
    actorName,
    action: "Processing Run Completed",
    entityType: "processing_run",
    entityId: run.id,
    entityLabel: run.processingRunNumber,
    field: "status",
    previousValue: "in_progress",
    newValue: "completed",
  });
  pushAudit(store, {
    actorName,
    action: "Raw Inventory Consumed",
    entityType: "inventory_item",
    entityId: raw.id,
    entityLabel: batch.batchNumber,
    field: "quantity",
    previousValue: String(previousRaw),
    newValue: String(raw.quantity),
  });
  if (processedId) {
    pushAudit(store, {
      actorName,
      action: "Processed Inventory Created",
      entityType: "inventory_item",
      entityId: processedId,
      entityLabel: batch.batchNumber,
      field: "quantity",
      previousValue: "0",
      newValue: `${yieldQty} ${run.inputUnit}`,
    });
  }
  if (wastageId) {
    pushAudit(store, {
      actorName,
      action: "Wastage Inventory Created",
      entityType: "inventory_item",
      entityId: wastageId,
      entityLabel: batch.batchNumber,
      field: "quantity",
      previousValue: "0",
      newValue: `${wastageQty} ${run.inputUnit}`,
    });
  }

  return {
    processingRunId: run.id,
    processingRunNumber: run.processingRunNumber,
    accepted: true,
  };
}

function num(value: number): number {
  return roundQuantity(value);
}

function batchForItem(store: Store, batchId: string): MockBatch | undefined {
  return store.batches.find((row) => row.id === batchId);
}

function inventoryOriginAt(item: MockInventory, batch: MockBatch): string {
  return getInventoryOriginAt({
    inventoryType: item.inventoryType,
    createdAt: item.createdAt,
    batchReceivedAt: batch.receivedAt,
  });
}

function summariseInventoryItems(items: MockInventory[], store: Store): InventoryBalanceSummary {
  const sumFor = (pick: (item: MockInventory) => number) =>
    num(items.reduce((total, item) => total + pick(item), 0));

  const byType = (type: InventoryType) =>
    num(items.filter((item) => item.inventoryType === type).reduce((sum, item) => sum + item.quantity, 0));

  const total = sumFor((item) => item.quantity);
  const reserved = sumFor((item) => item.reservedQuantity);
  const fresh = num(
    items
      .filter((item) => {
        const batch = batchForItem(store, item.batchId);
        if (!batch) return false;
        return getLifecycleState({
          inventoryType: item.inventoryType,
          quantity: item.quantity,
          frozenAt: item.frozenAt,
        }) === "fresh";
      })
      .reduce((sum, item) => sum + item.quantity, 0),
  );

  const scopedIds = new Set(items.map((item) => item.id));
  const fulfilled = num(
    store.inventoryMovements
      .filter((row) => row.movementType === "dispatch" && scopedIds.has(row.inventoryItemId))
      .reduce((sum, row) => sum + Math.abs(row.quantity), 0),
  );

  return {
    totalQuantity: total,
    reservedQuantity: reserved,
    availableQuantity: num(total - reserved),
    allocatedQuantity: reserved,
    fulfilledQuantity: fulfilled,
    rawQuantity: byType("raw"),
    processedQuantity: byType("processed"),
    frozenQuantity: byType("frozen"),
    wastageQuantity: byType("wastage"),
    freshQuantity: fresh,
  };
}

function mapInventoryListItem(store: Store, item: MockInventory): InventoryListItem | null {
  const batch = batchForItem(store, item.batchId);
  if (!batch) return null;

  const originAt = inventoryOriginAt(item, batch);
  const lifecycle = getLifecycleState({
    inventoryType: item.inventoryType,
    quantity: item.quantity,
    frozenAt: item.frozenAt,
  });

  return {
    id: item.id,
    batchId: item.batchId,
    batchNumber: batch.batchNumber,
    processingRunId: item.processingRunId,
    inventoryType: item.inventoryType as InventoryType,
    productSpecies: item.productSpecies,
    quantity: item.quantity,
    reservedQuantity: item.reservedQuantity,
    availableQuantity: num(item.quantity - item.reservedQuantity),
    unit: item.unit,
    status: item.status as InventoryListItem["status"],
    lifecycle,
    originAt,
    freshUntil: getFreshUntil(originAt),
    frozenAt: item.frozenAt,
    createdAt: item.createdAt,
  };
}

export function mockGetInventorySummary(): InventoryBalanceSummary {
  const store = getStore();
  return summariseInventoryItems(store.inventoryItems, store);
}

export function mockListInventory(filters: InventoryListFilters = {}): InventoryListItem[] {
  const store = getStore();
  const search = filters.search?.trim().toLowerCase();

  return store.inventoryItems
    .map((item) => mapInventoryListItem(store, item))
    .filter((item): item is InventoryListItem => {
      if (!item) return false;
      if (filters.batchId && item.batchId !== filters.batchId) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.lifecycle && item.lifecycle !== filters.lifecycle) return false;

      const typeFilter = filters.inventoryType;
      if (typeFilter) {
        const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
        if (!types.includes(item.inventoryType)) return false;
      }

      if (search) {
        const haystack = [item.id, item.batchNumber, item.productSpecies].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    })
    .sort((a, b) => a.batchNumber.localeCompare(b.batchNumber) || a.inventoryType.localeCompare(b.inventoryType));
}

export function mockListInventoryMovements(filters: InventoryMovementFilters = {}): InventoryMovementListItem[] {
  const store = getStore();
  const limit = filters.limit ?? 500;

  return store.inventoryMovements
  .filter((movement) => {
    if (filters.inventoryItemId && movement.inventoryItemId !== filters.inventoryItemId) return false;
    if (filters.movementType && movement.movementType !== filters.movementType) return false;
    if (filters.batchId) {
      const item = store.inventoryItems.find((row) => row.id === movement.inventoryItemId);
      if (!item || item.batchId !== filters.batchId) return false;
    }
    return true;
  })
    .map((movement) => {
      const item = store.inventoryItems.find((row) => row.id === movement.inventoryItemId);
      const batch = item ? batchForItem(store, item.batchId) : undefined;
      return {
        id: movement.id,
        inventoryItemId: movement.inventoryItemId,
        batchNumber: batch?.batchNumber ?? "—",
        productSpecies: item?.productSpecies ?? "—",
        movementType: movement.movementType,
        quantity: movement.quantity,
        unit: movement.unit,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
        previousQuantity: movement.previousQuantity,
        newQuantity: movement.newQuantity,
        performedAt: movement.performedAt,
        notes: movement.notes,
      };
    })
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
    .slice(0, limit);
}

export function mockGetBatchInventorySummary(batchId: string): BatchInventorySummary | null {
  const store = getStore();
  const batch = batchForItem(store, batchId);
  if (!batch) return null;

  const items = store.inventoryItems
    .filter((row) => row.batchId === batchId)
    .map((row) => mapInventoryListItem(store, row))
    .filter((row): row is InventoryListItem => Boolean(row));

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    productSpecies: batch.productSpecies,
    receivedAt: batch.receivedAt,
    items,
    totals: summariseInventoryItems(
      store.inventoryItems.filter((row) => row.batchId === batchId),
      store,
    ),
  };
}

export function mockGetInventoryItemDetail(id: string): InventoryItemDetail | null {
  const store = getStore();
  const item = store.inventoryItems.find((row) => row.id === id);
  if (!item) return null;
  const mapped = mapInventoryListItem(store, item);
  if (!mapped) return null;

  return {
    ...mapped,
    movements: mockListInventoryMovements({ inventoryItemId: id }),
  };
}

export function mockFreezeEligibleInventory(
  actorName: string,
  options: { now?: string } = {},
): FreezeResult {
  const store = getStore();
  const now = options.now ? new Date(options.now) : new Date();
  const frozenIds: string[] = [];

  const candidates = [...store.inventoryItems]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const item of candidates) {
    const batch = batchForItem(store, item.batchId);
    if (!batch) continue;

    const originAt = inventoryOriginAt(item, batch);
    if (!isEligibleForFreeze({
      inventoryType: item.inventoryType,
      quantity: item.quantity,
      frozenAt: item.frozenAt,
      originAt,
      now,
    })) {
      continue;
    }

    const reservedBefore = item.reservedQuantity;
    const qty = item.quantity;
    const previousType = item.inventoryType;

    item.inventoryType = "frozen";
    item.frozenAt = now.toISOString();

    store.inventoryMovements.push({
      id: createId("move"),
      inventoryItemId: item.id,
      movementType: "fresh_to_frozen",
      quantity: 0,
      unit: item.unit,
      referenceType: "inventory_lifecycle",
      referenceId: item.id,
      previousQuantity: qty,
      newQuantity: qty,
      performedAt: now.toISOString(),
      notes: `Reclassified from ${previousType} to frozen without changing on-hand quantity.`,
    });

    pushAudit(store, {
      actorName,
      action: "Inventory Frozen",
      entityType: "inventory_item",
      entityId: item.id,
      entityLabel: batch.batchNumber,
      field: "inventory_type",
      previousValue: previousType,
      newValue: "frozen",
    });

    if (item.reservedQuantity !== reservedBefore) {
      throw new Error("freeze must not change reserved_quantity");
    }

    frozenIds.push(item.id);
  }

  return {
    frozenCount: frozenIds.length,
    frozenIds,
  };
}
