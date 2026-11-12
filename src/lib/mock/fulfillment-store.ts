import { formatQuantity } from "@/lib/procurement-labels";
import { quantitiesEqual, quantityGreaterThan, roundQuantity, toMilli } from "@/lib/quantity";
import { getMockCustomerOrderContext } from "@/lib/mock/customer-order-store";
import { getMockInventoryContext } from "@/lib/mock/procurement-store";
import type { CustomerPoStatus } from "@/types/customer-orders";
import type { FulfilmentStatus, InventoryAllocationStatus, QaqcResult } from "@/types/database";
import { mockGetBatch } from "@/lib/mock/procurement-store";
import type {
  AllocateInventoryInput,
  AllocationRecord,
  AvailableInventoryForOrder,
  AvailableInventoryOption,
  BatchFulfillmentUsage,
  CreateFulfilmentInput,
  CustomerPoFulfillmentDetail,
  CustomerPoFulfillmentSummary,
  DispatchFulfilmentInput,
  FinalQaqcInput,
  FinalQaqcRecord,
  FulfillmentDashboardStats,
  FulfillmentTotals,
  FulfilmentItemRecord,
  FulfilmentRecord,
  FulfilmentTraceabilityLink,
  FulfilmentWorkspaceDetail,
  ItemReconciliation,
  OperationalFulfilmentBoard,
  OperationalFulfilmentBucket,
  OperationalFulfilmentRow,
} from "@/types/fulfillment";

/**
 * Mock implementation of the Step 7 RPCs. Business rules intentionally mirror
 * supabase/migrations/20261112000900_fulfilment_allocation.sql:
 * every operation validates first and mutates second, so a rejected request changes nothing.
 *
 * Seed data lives with its owners so IDs stay stable:
 *   customer-order-store: PO-1001 approved, Frozen Fish Fillet 500 kg
 *   procurement-store:    BATCH-2026-00012 (inv_proc_0012, 300 kg), BATCH-2026-00018 (inv_proc_0018, 250 kg)
 */

type MockAllocation = {
  id: string;
  customerPoItemId: string;
  fulfilmentId: string | null;
  inventoryItemId: string;
  batchId: string;
  allocatedQuantity: number;
  fulfilledQuantity: number;
  unit: string;
  status: InventoryAllocationStatus;
  allocatedAt: string;
  allocatedByName: string;
  releasedAt: string | null;
  releaseReason: string | null;
};

type MockFulfilment = {
  id: string;
  fulfilmentNumber: string;
  customerPoId: string;
  status: FulfilmentStatus;
  plannedDate: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  dispatchedAt: string | null;
  fulfilledAt: string | null;
  notes: string | null;
  createdAt: string;
};

type MockFulfilmentItem = {
  id: string;
  fulfilmentId: string;
  customerPoItemId: string;
  inventoryItemId: string;
  batchId: string;
  allocationId: string;
  quantity: number;
  dispatchedQuantity: number;
  unit: string;
};

type MockFinalQaqc = {
  id: string;
  customerPoId: string;
  fulfilmentId: string;
  inspectionDate: string;
  result: QaqcResult;
  quantityChecked: number | null;
  notes: string | null;
  status: string;
  inspectorName: string;
  recordedAt: string;
};

type MockAudit = {
  id: string;
  customerPoId: string;
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

type Store = {
  allocations: MockAllocation[];
  fulfilments: MockFulfilment[];
  fulfilmentItems: MockFulfilmentItem[];
  finalQaqc: MockFinalQaqc[];
  audits: MockAudit[];
  fulfilmentCounter: number;
};

const globalStore = globalThis as typeof globalThis & { __seadockFulfillmentStore?: Store };

function getStore(): Store {
  if (!globalStore.__seadockFulfillmentStore) {
    globalStore.__seadockFulfillmentStore = {
      allocations: [],
      fulfilments: [],
      fulfilmentItems: [],
      finalQaqc: [],
      audits: [],
      fulfilmentCounter: 0,
    };
  }
  return globalStore.__seadockFulfillmentStore;
}

const SELLABLE_TYPES = ["processed", "frozen"];
const ALLOCATABLE_PO_STATUSES: CustomerPoStatus[] = [
  "approved",
  "partially_allocated",
  "ready_for_fulfillment",
  "partially_fulfilled",
];

function nextFulfilmentNumber(store: Store): string {
  store.fulfilmentCounter += 1;
  return `FUL-${new Date().getUTCFullYear()}-${String(store.fulfilmentCounter).padStart(5, "0")}`;
}

function pushAudit(
  store: Store,
  input: Omit<MockAudit, "id" | "timestamp" | "field" | "previousValue" | "newValue"> &
    Partial<Pick<MockAudit, "field" | "previousValue" | "newValue">>,
) {
  const { createId, nowIso } = getMockInventoryContext();
  store.audits.unshift({
    id: createId("audit"),
    timestamp: nowIso(),
    field: input.field ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    customerPoId: input.customerPoId,
    actorName: input.actorName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
  });
}

function requirePo(poId: string) {
  const ctx = getMockCustomerOrderContext();
  const po = ctx.purchaseOrders.find((row) => row.id === poId);
  if (!po) throw new Error("Customer purchase order not found.");
  return { ctx, po };
}

function poItemsFor(poId: string) {
  return getMockCustomerOrderContext().items.filter((item) => item.customerPoId === poId);
}

function openReserved(allocation: MockAllocation): number {
  return allocation.status === "active"
    ? roundQuantity(allocation.allocatedQuantity - allocation.fulfilledQuantity)
    : 0;
}

function openAllocatedForItem(store: Store, itemId: string): number {
  return roundQuantity(
    store.allocations
      .filter((row) => row.customerPoItemId === itemId)
      .reduce((sum, row) => sum + openReserved(row), 0),
  );
}

function findBatch(batchId: string) {
  return getMockInventoryContext().batches.find((row) => row.id === batchId);
}

function findInventory(inventoryItemId: string) {
  return getMockInventoryContext().inventoryItems.find((row) => row.id === inventoryItemId);
}

function syncInventoryStatus(inventory: { quantity: number; reservedQuantity: number; status: string }) {
  if (inventory.status === "archived") return;
  if (toMilli(inventory.quantity) <= 0) inventory.status = "dispatched";
  else if (toMilli(inventory.reservedQuantity) >= toMilli(inventory.quantity)) inventory.status = "reserved";
  else inventory.status = "available";
}

function pushMovement(
  movementType: "reservation" | "release" | "dispatch",
  inventoryId: string,
  quantity: number,
  unit: string,
  referenceType: string,
  referenceId: string,
  previousQuantity: number,
  newQuantity: number,
  notes: string,
) {
  const { inventoryMovements, createId, nowIso } = getMockInventoryContext();
  inventoryMovements.push({
    id: createId("move"),
    inventoryItemId: inventoryId,
    movementType,
    quantity,
    unit,
    referenceType,
    referenceId,
    previousQuantity,
    newQuantity,
    performedAt: nowIso(),
    notes,
  });
}

/** Mirrors recalc_customer_po_fulfilment_status. Allocation never marks a PO fulfilled. */
function recalcPoStatus(store: Store, poId: string, actorName: string): CustomerPoStatus {
  const { ctx, po } = requirePo(poId);
  if (!["approved", "partially_allocated", "ready_for_fulfillment", "partially_fulfilled", "fulfilled"].includes(po.status)) {
    return po.status;
  }

  const items = poItemsFor(poId).filter((item) => item.status !== "cancelled");
  const requested = roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0));
  const fulfilled = roundQuantity(items.reduce((sum, item) => sum + item.fulfilledQuantity, 0));
  const open = roundQuantity(items.reduce((sum, item) => sum + openAllocatedForItem(store, item.id), 0));

  let next: CustomerPoStatus;
  if (requested > 0 && !quantityGreaterThan(requested, fulfilled)) next = "fulfilled";
  else if (fulfilled > 0) next = "partially_fulfilled";
  else if (requested > 0 && !quantityGreaterThan(requested, open + fulfilled)) next = "ready_for_fulfillment";
  else if (open > 0) next = "partially_allocated";
  else next = "approved";

  if (next !== po.status) {
    const previous = po.status;
    po.status = next;
    po.updatedAt = ctx.nowIso();
    ctx.pushHistory({
      customerPoId: po.id,
      fromStatus: previous,
      toStatus: next,
      changedByName: actorName,
      reason: "Allocation and fulfilment update",
      notes: "Status recalculated from allocations and fulfilled quantity",
    });
    pushAudit(store, {
      customerPoId: po.id,
      actorName,
      action: "Customer PO Status Changed",
      entityType: "customer_purchase_order",
      entityId: po.id,
      entityLabel: po.poNumber,
      field: "status",
      previousValue: previous,
      newValue: next,
    });
  }
  return next;
}

function aggregate<T extends { quantity: number }>(
  lines: T[],
  keyOf: (line: T) => string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(keyOf(line), roundQuantity((totals.get(keyOf(line)) ?? 0) + roundQuantity(line.quantity)));
  }
  return totals;
}

function productMatches(inventorySpecies: string, item: { species: string; productName: string }): boolean {
  const target = inventorySpecies.trim().toLowerCase();
  return [item.species, item.productName].some((value) => value.trim().toLowerCase() === target);
}

function toAllocationRecord(store: Store, allocation: MockAllocation): AllocationRecord {
  const item = getMockCustomerOrderContext().items.find((row) => row.id === allocation.customerPoItemId);
  const batch = findBatch(allocation.batchId);
  const inventory = findInventory(allocation.inventoryItemId);
  const fulfilment = store.fulfilments.find((row) => row.id === allocation.fulfilmentId);
  return {
    id: allocation.id,
    customerPoItemId: allocation.customerPoItemId,
    lineNumber: item?.lineNumber ?? 0,
    productName: item?.productName ?? "Unknown item",
    fulfilmentId: allocation.fulfilmentId,
    fulfilmentNumber: fulfilment?.fulfilmentNumber ?? null,
    inventoryItemId: allocation.inventoryItemId,
    batchId: allocation.batchId,
    batchNumber: batch?.batchNumber ?? "",
    inventoryType: (inventory?.inventoryType ?? "processed") as AllocationRecord["inventoryType"],
    allocatedQuantity: allocation.allocatedQuantity,
    fulfilledQuantity: allocation.fulfilledQuantity,
    reservedQuantity: openReserved(allocation),
    unit: allocation.unit,
    status: allocation.status,
    allocatedAt: allocation.allocatedAt,
    releasedAt: allocation.releasedAt,
    releaseReason: allocation.releaseReason,
  };
}

function toFinalQaqcRecord(row: MockFinalQaqc): FinalQaqcRecord {
  return {
    id: row.id,
    fulfilmentId: row.fulfilmentId,
    inspectionDate: row.inspectionDate,
    result: row.result,
    quantityChecked: row.quantityChecked,
    notes: row.notes,
    status: row.status,
    inspectorName: row.inspectorName,
    recordedAt: row.recordedAt,
  };
}

function toFulfilmentRecord(store: Store, fulfilment: MockFulfilment): FulfilmentRecord {
  const poItems = poItemsFor(fulfilment.customerPoId);
  const items: FulfilmentItemRecord[] = store.fulfilmentItems
    .filter((row) => row.fulfilmentId === fulfilment.id)
    .map((row) => {
      const poItem = poItems.find((item) => item.id === row.customerPoItemId);
      return {
        id: row.id,
        customerPoItemId: row.customerPoItemId,
        lineNumber: poItem?.lineNumber ?? 0,
        productName: poItem?.productName ?? "Unknown item",
        allocationId: row.allocationId,
        inventoryItemId: row.inventoryItemId,
        batchId: row.batchId,
        batchNumber: findBatch(row.batchId)?.batchNumber ?? "",
        quantity: row.quantity,
        dispatchedQuantity: row.dispatchedQuantity,
        remainingQuantity: roundQuantity(row.quantity - row.dispatchedQuantity),
        unit: row.unit,
      };
    })
    .sort((a, b) => a.lineNumber - b.lineNumber || a.batchNumber.localeCompare(b.batchNumber));

  const qaqc = store.finalQaqc.find((row) => row.fulfilmentId === fulfilment.id && row.status !== "cancelled");
  const total = roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0));
  const dispatched = roundQuantity(items.reduce((sum, item) => sum + item.dispatchedQuantity, 0));
  const qaqcOk = qaqc ? ["passed", "conditional"].includes(qaqc.result) : false;

  return {
    id: fulfilment.id,
    fulfilmentNumber: fulfilment.fulfilmentNumber,
    status: fulfilment.status,
    plannedDate: fulfilment.plannedDate,
    vehicleNumber: fulfilment.vehicleNumber,
    driverName: fulfilment.driverName,
    dispatchedAt: fulfilment.dispatchedAt,
    fulfilledAt: fulfilment.fulfilledAt,
    notes: fulfilment.notes,
    createdAt: fulfilment.createdAt,
    items,
    finalQaqc: qaqc ? toFinalQaqcRecord(qaqc) : null,
    totalQuantity: total,
    dispatchedQuantity: dispatched,
    canDispatch:
      ["ready", "partially_dispatched"].includes(fulfilment.status) &&
      qaqcOk &&
      quantityGreaterThan(total, dispatched),
  };
}

function reconcileItems(store: Store, poId: string): ItemReconciliation[] {
  return poItemsFor(poId)
    .filter((item) => item.status !== "cancelled")
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((item) => {
      const allocated = openAllocatedForItem(store, item.id);
      return {
        customerPoItemId: item.id,
        lineNumber: item.lineNumber,
        productName: item.productName,
        species: item.species,
        unit: item.unit,
        requestedQuantity: item.quantity,
        allocatedQuantity: allocated,
        fulfilledQuantity: item.fulfilledQuantity,
        remainingQuantity: roundQuantity(item.quantity - item.fulfilledQuantity),
        unallocatedQuantity: Math.max(
          roundQuantity(item.quantity - item.fulfilledQuantity - allocated),
          0,
        ),
      };
    });
}

function sumTotals(items: ItemReconciliation[]): FulfillmentTotals {
  const sum = (pick: (item: ItemReconciliation) => number) =>
    roundQuantity(items.reduce((total, item) => total + pick(item), 0));
  return {
    requestedQuantity: sum((item) => item.requestedQuantity),
    allocatedQuantity: sum((item) => item.allocatedQuantity),
    fulfilledQuantity: sum((item) => item.fulfilledQuantity),
    remainingQuantity: sum((item) => item.remainingQuantity),
    unallocatedQuantity: sum((item) => item.unallocatedQuantity),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function mockGetAvailableInventory(poId: string): AvailableInventoryForOrder | null {
  const store = getStore();
  const ctx = getMockCustomerOrderContext();
  const po = ctx.purchaseOrders.find((row) => row.id === poId);
  if (!po) return null;
  const inventory = getMockInventoryContext();

  const items = reconcileItems(store, poId).map((reconciled) => {
    const poItem = ctx.items.find((row) => row.id === reconciled.customerPoItemId)!;
    const options: AvailableInventoryOption[] = inventory.inventoryItems
      .filter(
        (row) =>
          SELLABLE_TYPES.includes(row.inventoryType) &&
          ["available", "reserved"].includes(row.status) &&
          row.unit === poItem.unit &&
          productMatches(row.productSpecies, poItem) &&
          quantityGreaterThan(row.quantity, row.reservedQuantity),
      )
      .map((row) => {
        const batch = inventory.batches.find((candidate) => candidate.id === row.batchId);
        const run = inventory.processingRuns.find((candidate) => candidate.id === row.processingRunId);
        return {
          option: {
            inventoryItemId: row.id,
            batchId: row.batchId,
            batchNumber: batch?.batchNumber ?? "",
            inventoryType: row.inventoryType as AvailableInventoryOption["inventoryType"],
            productSpecies: row.productSpecies,
            totalQuantity: row.quantity,
            reservedQuantity: row.reservedQuantity,
            availableQuantity: roundQuantity(row.quantity - row.reservedQuantity),
            unit: row.unit,
            storageLocation: null,
            processingRunNumber: run?.processingRunNumber ?? null,
          } satisfies AvailableInventoryOption,
          receivedAt: batch?.receivedAt ?? "",
        };
      })
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.option.batchNumber.localeCompare(b.option.batchNumber))
      .map((entry) => entry.option);

    return {
      customerPoItemId: reconciled.customerPoItemId,
      lineNumber: reconciled.lineNumber,
      productName: reconciled.productName,
      species: reconciled.species,
      unit: reconciled.unit,
      requestedQuantity: reconciled.requestedQuantity,
      fulfilledQuantity: reconciled.fulfilledQuantity,
      allocatedQuantity: reconciled.allocatedQuantity,
      unallocatedQuantity: reconciled.unallocatedQuantity,
      options,
    };
  });

  return { customerPoId: po.id, poNumber: po.poNumber, items };
}

export function mockGetFulfillmentDetail(poId: string): CustomerPoFulfillmentDetail | null {
  const store = getStore();
  const po = getMockCustomerOrderContext().purchaseOrders.find((row) => row.id === poId);
  if (!po) return null;
  const items = reconcileItems(store, poId);
  const itemIds = new Set(poItemsFor(poId).map((item) => item.id));

  return {
    customerPoId: po.id,
    poNumber: po.poNumber,
    poStatus: po.status,
    items,
    totals: sumTotals(items),
    allocations: store.allocations
      .filter((row) => itemIds.has(row.customerPoItemId))
      .map((row) => toAllocationRecord(store, row))
      .sort((a, b) => a.allocatedAt.localeCompare(b.allocatedAt) || a.lineNumber - b.lineNumber),
    fulfilments: store.fulfilments
      .filter((row) => row.customerPoId === poId)
      .map((row) => toFulfilmentRecord(store, row))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export function mockGetFulfillmentSummary(poId: string): CustomerPoFulfillmentSummary {
  const store = getStore();
  const items = reconcileItems(store, poId);
  const itemIds = new Set(poItemsFor(poId).map((item) => item.id));
  return {
    ...sumTotals(items),
    activeAllocationCount: store.allocations.filter(
      (row) => itemIds.has(row.customerPoItemId) && row.status === "active",
    ).length,
    fulfilmentCount: store.fulfilments.filter(
      (row) => row.customerPoId === poId && row.status !== "cancelled",
    ).length,
  };
}

export function mockListFulfillmentAudits(poId: string) {
  return getStore()
    .audits.filter((row) => row.customerPoId === poId)
    .map((row) => ({
      id: row.id,
      actorName: row.actorName,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityLabel: row.entityLabel,
      field: row.field,
      previousValue: row.previousValue,
      newValue: row.newValue,
      timestamp: row.timestamp,
    }));
}

export function mockFulfillmentDashboardStats(): FulfillmentDashboardStats {
  const store = getStore();
  const live = store.fulfilments.filter((row) => {
    const po = getMockCustomerOrderContext().purchaseOrders.find((candidate) => candidate.id === row.customerPoId);
    return po && po.status !== "cancelled";
  });
  return {
    awaitingFinalQaqc: live.filter((row) => row.status === "draft").length,
    readyForDispatch: live.filter((row) => ["ready", "partially_dispatched"].includes(row.status)).length,
  };
}

export function mockBatchFulfillmentUsage(batchId: string): BatchFulfillmentUsage {
  const store = getStore();
  const inventory = getMockInventoryContext();
  const ctx = getMockCustomerOrderContext();
  const batchItems = inventory.inventoryItems.filter(
    (row) => row.batchId === batchId && SELLABLE_TYPES.includes(row.inventoryType),
  );
  const unit = batchItems[0]?.unit ?? findBatch(batchId)?.unit ?? "kg";
  const total = roundQuantity(batchItems.reduce((sum, row) => sum + row.quantity, 0));
  const reserved = roundQuantity(batchItems.reduce((sum, row) => sum + row.reservedQuantity, 0));
  const allocations = store.allocations.filter((row) => row.batchId === batchId);

  return {
    batchId,
    unit,
    totalQuantity: total,
    reservedQuantity: reserved,
    availableQuantity: roundQuantity(total - reserved),
    dispatchedQuantity: roundQuantity(allocations.reduce((sum, row) => sum + row.fulfilledQuantity, 0)),
    inventoryItems: batchItems.map((row) => ({
      inventoryItemId: row.id,
      inventoryType: row.inventoryType as AvailableInventoryOption["inventoryType"],
      totalQuantity: row.quantity,
      reservedQuantity: row.reservedQuantity,
      availableQuantity: roundQuantity(row.quantity - row.reservedQuantity),
      unit: row.unit,
    })),
    allocations: allocations
      .map((row) => {
        const item = ctx.items.find((candidate) => candidate.id === row.customerPoItemId);
        const po = ctx.purchaseOrders.find((candidate) => candidate.id === item?.customerPoId);
        const customer = ctx.customers.find((candidate) => candidate.id === po?.customerId);
        const fulfilment = store.fulfilments.find((candidate) => candidate.id === row.fulfilmentId);
        return {
          allocationId: row.id,
          customerPoId: po?.id ?? "",
          poNumber: po?.poNumber ?? "",
          customerName: customer?.name ?? "Unknown customer",
          fulfilmentNumber: fulfilment?.fulfilmentNumber ?? null,
          allocatedQuantity: row.allocatedQuantity,
          fulfilledQuantity: row.fulfilledQuantity,
          status: row.status,
          unit: row.unit,
        };
      })
      .sort((a, b) => a.poNumber.localeCompare(b.poNumber)),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function mockAllocateInventory(input: AllocateInventoryInput, actorName: string) {
  const store = getStore();
  const ctx = getMockCustomerOrderContext();
  const inventory = getMockInventoryContext();

  if (!input.lines.length) throw new Error("At least one inventory allocation line is required.");
  for (const line of input.lines) {
    if (!line.inventoryItemId) throw new Error("Inventory item is required for each allocation line.");
    if (!(roundQuantity(line.quantity) > 0)) throw new Error("Allocation quantity must be greater than zero.");
  }

  const item = ctx.items.find((row) => row.id === input.customerPoItemId);
  if (!item) throw new Error("Customer PO item not found.");
  const po = ctx.purchaseOrders.find((row) => row.id === item.customerPoId)!;

  if (!ALLOCATABLE_PO_STATUSES.includes(po.status)) {
    throw new Error("Customer PO must be approved before inventory can be allocated.");
  }
  if (item.status === "cancelled") throw new Error("This PO item is cancelled.");

  const unallocated = roundQuantity(
    item.quantity - item.fulfilledQuantity - openAllocatedForItem(store, item.id),
  );
  const totals = aggregate(input.lines.map((line) => ({ ...line })), (line) => line.inventoryItemId);
  const totalQuantity = roundQuantity([...totals.values()].reduce((sum, qty) => sum + qty, 0));

  if (quantityGreaterThan(totalQuantity, unallocated)) {
    throw new Error(
      `Allocation of ${totalQuantity} ${item.unit} exceeds the unallocated PO quantity of ${Math.max(unallocated, 0)} ${item.unit}.`,
    );
  }

  // Validate every line before touching stock.
  for (const [inventoryItemId, quantity] of totals) {
    const stock = inventory.inventoryItems.find((row) => row.id === inventoryItemId);
    if (!stock) throw new Error("Inventory item not found.");
    if (stock.inventoryType === "wastage") {
      throw new Error("Wastage inventory cannot be allocated to a customer purchase order.");
    }
    if (!SELLABLE_TYPES.includes(stock.inventoryType)) {
      throw new Error("Only processed or frozen inventory can be allocated to a customer purchase order.");
    }
    if (!["available", "reserved"].includes(stock.status)) {
      throw new Error("Inventory item is not available for allocation.");
    }
    if (!productMatches(stock.productSpecies, item)) {
      throw new Error(`Inventory product ${stock.productSpecies} does not match the PO item product ${item.productName}.`);
    }
    if (stock.unit !== item.unit) {
      throw new Error(`Inventory unit ${stock.unit} does not match the PO item unit ${item.unit}.`);
    }
    const available = roundQuantity(stock.quantity - stock.reservedQuantity);
    if (quantityGreaterThan(quantity, available)) {
      throw new Error(`Cannot allocate ${quantity} ${stock.unit} from this inventory item: only ${available} ${stock.unit} available.`);
    }
  }

  const allocationIds: string[] = [];
  for (const [inventoryItemId, quantity] of totals) {
    const stock = inventory.inventoryItems.find((row) => row.id === inventoryItemId)!;
    const allocation: MockAllocation = {
      id: inventory.createId("alloc"),
      customerPoItemId: item.id,
      fulfilmentId: null,
      inventoryItemId: stock.id,
      batchId: stock.batchId,
      allocatedQuantity: quantity,
      fulfilledQuantity: 0,
      unit: stock.unit,
      status: "active",
      allocatedAt: inventory.nowIso(),
      allocatedByName: actorName,
      releasedAt: null,
      releaseReason: null,
    };
    store.allocations.push(allocation);
    allocationIds.push(allocation.id);

    stock.reservedQuantity = roundQuantity(stock.reservedQuantity + quantity);
    syncInventoryStatus(stock);

    pushMovement(
      "reservation",
      stock.id,
      quantity,
      stock.unit,
      "inventory_allocation",
      allocation.id,
      stock.quantity,
      stock.quantity,
      `Reserved ${quantity} ${stock.unit} for ${po.poNumber}. Stock quantity unchanged.`,
    );
    pushAudit(store, {
      customerPoId: po.id,
      actorName,
      action: "Inventory Allocated",
      entityType: "inventory_allocation",
      entityId: allocation.id,
      entityLabel: po.poNumber,
      field: "allocated_quantity",
      newValue: `${quantity} ${stock.unit}`,
    });
  }

  const status = recalcPoStatus(store, po.id, actorName);
  return {
    allocationIds,
    allocatedQuantity: totalQuantity,
    unallocatedQuantity: Math.max(roundQuantity(unallocated - totalQuantity), 0),
    customerPoStatus: status,
  };
}

export function mockReleaseAllocation(allocationId: string, reason: string, actorName: string) {
  const store = getStore();
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("A release reason is required.");

  const allocation = store.allocations.find((row) => row.id === allocationId);
  if (!allocation) throw new Error("Allocation not found.");
  if (allocation.status !== "active") throw new Error("Only active allocations can be released.");
  if (allocation.fulfilledQuantity > 0) throw new Error("Dispatched allocations cannot be released.");

  const fulfilment = store.fulfilments.find((row) => row.id === allocation.fulfilmentId);
  if (fulfilment && fulfilment.status !== "cancelled") {
    throw new Error(`Allocation is attached to fulfilment ${fulfilment.fulfilmentNumber}. Cancel the fulfilment before releasing it.`);
  }

  const stock = findInventory(allocation.inventoryItemId);
  if (!stock || toMilli(stock.reservedQuantity) < toMilli(allocation.allocatedQuantity)) {
    throw new Error("Reserved quantity is inconsistent for this inventory item.");
  }

  const item = getMockCustomerOrderContext().items.find((row) => row.id === allocation.customerPoItemId)!;
  const { po } = requirePo(item.customerPoId);

  stock.reservedQuantity = roundQuantity(stock.reservedQuantity - allocation.allocatedQuantity);
  syncInventoryStatus(stock);
  allocation.status = "released";
  allocation.releasedAt = getMockInventoryContext().nowIso();
  allocation.releaseReason = cleanReason;

  pushMovement(
    "release",
    stock.id,
    allocation.allocatedQuantity,
    allocation.unit,
    "inventory_allocation",
    allocation.id,
    stock.quantity,
    stock.quantity,
    `Released reservation for ${po.poNumber}. Stock quantity unchanged. ${cleanReason}`,
  );
  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Inventory Allocation Released",
    entityType: "inventory_allocation",
    entityId: allocation.id,
    entityLabel: po.poNumber,
    field: "status",
    previousValue: "active",
    newValue: "released",
  });

  const status = recalcPoStatus(store, po.id, actorName);
  return { allocationId: allocation.id, releasedQuantity: allocation.allocatedQuantity, customerPoStatus: status };
}

export function mockCreateFulfilment(input: CreateFulfilmentInput, actorName: string) {
  const store = getStore();
  const ctx = getMockCustomerOrderContext();
  const { po } = requirePo(input.customerPoId);

  const ids = [...new Set(input.allocationIds)];
  if (!ids.length) throw new Error("Select at least one active allocation for the fulfilment.");
  if (!ALLOCATABLE_PO_STATUSES.includes(po.status)) throw new Error("Customer PO is not open for fulfilment.");

  const itemIds = new Set(poItemsFor(po.id).map((item) => item.id));
  const allocations = ids.map((id) => store.allocations.find((row) => row.id === id));
  if (allocations.some((row) => !row || !itemIds.has(row.customerPoItemId))) {
    throw new Error("One or more allocations do not belong to this customer purchase order.");
  }
  const rows = allocations as MockAllocation[];
  if (rows.some((row) => row.status !== "active" || row.fulfilmentId !== null || row.fulfilledQuantity > 0)) {
    throw new Error("Only active, unattached allocations can be added to a fulfilment.");
  }

  const fulfilment: MockFulfilment = {
    id: ctx.createId("ful"),
    fulfilmentNumber: nextFulfilmentNumber(store),
    customerPoId: po.id,
    status: "draft",
    plannedDate: input.plannedDate || null,
    vehicleNumber: null,
    driverName: null,
    dispatchedAt: null,
    fulfilledAt: null,
    notes: input.notes.trim() || null,
    createdAt: ctx.nowIso(),
  };
  store.fulfilments.push(fulfilment);

  for (const allocation of rows) {
    store.fulfilmentItems.push({
      id: ctx.createId("fi"),
      fulfilmentId: fulfilment.id,
      customerPoItemId: allocation.customerPoItemId,
      inventoryItemId: allocation.inventoryItemId,
      batchId: allocation.batchId,
      allocationId: allocation.id,
      quantity: roundQuantity(allocation.allocatedQuantity - allocation.fulfilledQuantity),
      dispatchedQuantity: 0,
      unit: allocation.unit,
    });
    allocation.fulfilmentId = fulfilment.id;
  }

  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Fulfilment Created",
    entityType: "fulfilment",
    entityId: fulfilment.id,
    entityLabel: fulfilment.fulfilmentNumber,
    field: "status",
    newValue: "draft",
  });

  return {
    fulfilmentId: fulfilment.id,
    fulfilmentNumber: fulfilment.fulfilmentNumber,
    status: fulfilment.status,
    itemCount: rows.length,
  };
}

export function mockRecordFinalQaqc(input: FinalQaqcInput, actorName: string) {
  const store = getStore();
  if (!["passed", "conditional", "failed"].includes(input.result)) {
    throw new Error("Final QAQC result must be passed, conditional, or failed.");
  }
  const quantityChecked = input.quantityChecked == null ? null : roundQuantity(input.quantityChecked);
  if (quantityChecked != null && quantityChecked < 0) throw new Error("Quantity checked cannot be negative.");

  const fulfilment = store.fulfilments.find((row) => row.id === input.fulfilmentId);
  if (!fulfilment) throw new Error("Fulfilment not found.");
  if (["cancelled", "dispatched", "fulfilled"].includes(fulfilment.status)) {
    throw new Error(`Final QAQC cannot be recorded for a ${fulfilment.status} fulfilment.`);
  }
  const { ctx, po } = requirePo(fulfilment.customerPoId);

  const existing = store.finalQaqc.find((row) => row.fulfilmentId === fulfilment.id && row.status !== "cancelled");
  const previousResult = existing?.result ?? null;
  const record: MockFinalQaqc = existing ?? {
    id: ctx.createId("fqaqc"),
    customerPoId: po.id,
    fulfilmentId: fulfilment.id,
    inspectionDate: "",
    result: input.result,
    quantityChecked: null,
    notes: null,
    status: "completed",
    inspectorName: actorName,
    recordedAt: ctx.nowIso(),
  };
  record.inspectionDate = input.inspectionDate || ctx.nowIso().slice(0, 10);
  record.result = input.result;
  record.quantityChecked = quantityChecked;
  record.notes = input.notes.trim() || null;
  record.status = "completed";
  record.inspectorName = actorName;
  record.recordedAt = ctx.nowIso();
  if (!existing) store.finalQaqc.push(record);

  const previousStatus = fulfilment.status;
  if (["passed", "conditional"].includes(input.result) && fulfilment.status === "draft") fulfilment.status = "ready";
  else if (input.result === "failed" && fulfilment.status === "ready") fulfilment.status = "draft";

  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Final QAQC Recorded",
    entityType: "final_qaqc",
    entityId: record.id,
    entityLabel: fulfilment.fulfilmentNumber,
    field: "result",
    previousValue: previousResult,
    newValue: input.result,
  });
  if (previousStatus !== fulfilment.status) {
    pushAudit(store, {
      customerPoId: po.id,
      actorName,
      action: "Fulfilment Status Changed",
      entityType: "fulfilment",
      entityId: fulfilment.id,
      entityLabel: fulfilment.fulfilmentNumber,
      field: "status",
      previousValue: previousStatus,
      newValue: fulfilment.status,
    });
  }

  return {
    finalQaqcId: record.id,
    result: input.result,
    fulfilmentStatus: fulfilment.status,
    dispatchAllowed: ["passed", "conditional"].includes(input.result),
  };
}

export function mockDispatchFulfilment(input: DispatchFulfilmentInput, actorName: string) {
  const store = getStore();
  const inventory = getMockInventoryContext();
  const fulfilment = store.fulfilments.find((row) => row.id === input.fulfilmentId);
  if (!fulfilment) throw new Error("Fulfilment not found.");
  const { ctx, po } = requirePo(fulfilment.customerPoId);

  if (["cancelled", "fulfilled"].includes(po.status)) {
    throw new Error(`Customer PO is ${po.status} and cannot be dispatched.`);
  }
  if (fulfilment.status === "draft") throw new Error("Final QAQC must be passed or conditional before dispatch.");
  if (!["ready", "partially_dispatched"].includes(fulfilment.status)) {
    throw new Error(`Fulfilment is ${fulfilment.status} and cannot be dispatched.`);
  }

  const qaqc = store.finalQaqc.find((row) => row.fulfilmentId === fulfilment.id && row.status !== "cancelled");
  if (!qaqc || !["passed", "conditional"].includes(qaqc.result)) {
    throw new Error("Final QAQC must be passed or conditional before dispatch.");
  }

  const vehicle = input.vehicleNumber.trim() || fulfilment.vehicleNumber;
  const driver = input.driverName.trim() || fulfilment.driverName;
  if (!vehicle) throw new Error("Vehicle number is required for dispatch.");
  if (!driver) throw new Error("Driver name is required for dispatch.");

  const items = store.fulfilmentItems.filter((row) => row.fulfilmentId === fulfilment.id);
  const lines = input.lines.length
    ? input.lines
    : items
        .filter((row) => quantityGreaterThan(row.quantity, row.dispatchedQuantity))
        .map((row) => ({ fulfilmentItemId: row.id, quantity: roundQuantity(row.quantity - row.dispatchedQuantity) }));
  if (!lines.length) throw new Error("Nothing remains to dispatch for this fulfilment.");

  for (const line of lines) {
    if (!line.fulfilmentItemId) throw new Error("Fulfilment item is required for each dispatch line.");
    if (!(roundQuantity(line.quantity) > 0)) throw new Error("Dispatch quantity must be greater than zero.");
  }

  const perItem = aggregate(lines.map((line) => ({ ...line })), (line) => line.fulfilmentItemId);
  const perInventory = new Map<string, number>();
  const perPoItem = new Map<string, number>();

  // Validate everything first.
  for (const [fulfilmentItemId, quantity] of perItem) {
    const row = items.find((candidate) => candidate.id === fulfilmentItemId);
    if (!row) throw new Error("One or more dispatch lines do not belong to this fulfilment.");
    const allocation = store.allocations.find((candidate) => candidate.id === row.allocationId);
    if (!allocation || allocation.status !== "active") {
      throw new Error("Allocation for this fulfilment item is no longer active.");
    }
    const remaining = roundQuantity(row.quantity - row.dispatchedQuantity);
    if (quantityGreaterThan(quantity, remaining)) {
      throw new Error(`Dispatch quantity ${quantity} ${row.unit} exceeds the remaining fulfilment quantity of ${remaining} ${row.unit}.`);
    }
    perInventory.set(row.inventoryItemId, roundQuantity((perInventory.get(row.inventoryItemId) ?? 0) + quantity));
    perPoItem.set(row.customerPoItemId, roundQuantity((perPoItem.get(row.customerPoItemId) ?? 0) + quantity));
  }
  for (const [inventoryItemId, quantity] of perInventory) {
    const stock = inventory.inventoryItems.find((row) => row.id === inventoryItemId);
    if (!stock || quantityGreaterThan(quantity, stock.reservedQuantity) || quantityGreaterThan(quantity, stock.quantity)) {
      throw new Error(`Reserved stock is insufficient to dispatch ${quantity} ${stock?.unit ?? "kg"} from this inventory item.`);
    }
  }
  for (const [poItemId, quantity] of perPoItem) {
    const poItem = ctx.items.find((row) => row.id === poItemId)!;
    if (quantityGreaterThan(poItem.fulfilledQuantity + quantity, poItem.quantity)) {
      throw new Error("Dispatch quantity exceeds the remaining requested quantity for this PO item.");
    }
  }

  let total = 0;
  for (const [fulfilmentItemId, quantity] of perItem) {
    const row = items.find((candidate) => candidate.id === fulfilmentItemId)!;
    const allocation = store.allocations.find((candidate) => candidate.id === row.allocationId)!;
    const stock = inventory.inventoryItems.find((candidate) => candidate.id === row.inventoryItemId)!;
    const poItem = ctx.items.find((candidate) => candidate.id === row.customerPoItemId)!;
    const previousQuantity = stock.quantity;

    stock.quantity = roundQuantity(stock.quantity - quantity);
    stock.reservedQuantity = roundQuantity(stock.reservedQuantity - quantity);
    syncInventoryStatus(stock);

    allocation.fulfilledQuantity = roundQuantity(allocation.fulfilledQuantity + quantity);
    if (quantitiesEqual(allocation.fulfilledQuantity, allocation.allocatedQuantity)) allocation.status = "fulfilled";

    row.dispatchedQuantity = roundQuantity(row.dispatchedQuantity + quantity);

    poItem.fulfilledQuantity = roundQuantity(poItem.fulfilledQuantity + quantity);
    poItem.status = quantitiesEqual(poItem.fulfilledQuantity, poItem.quantity) ? "fulfilled" : "partially_fulfilled";

    pushMovement(
      "dispatch",
      stock.id,
      -quantity,
      stock.unit,
      "fulfilment",
      fulfilment.id,
      previousQuantity,
      stock.quantity,
      `Dispatched on ${fulfilment.fulfilmentNumber} for ${po.poNumber}`,
    );
    pushAudit(store, {
      customerPoId: po.id,
      actorName,
      action: "Inventory Dispatched",
      entityType: "inventory_item",
      entityId: stock.id,
      entityLabel: findBatch(stock.batchId)?.batchNumber ?? "",
      field: "quantity",
      previousValue: String(previousQuantity),
      newValue: String(stock.quantity),
    });
    total = roundQuantity(total + quantity);
  }

  const poStatus = recalcPoStatus(store, po.id, actorName);
  const allDispatched = items.every((row) => !quantityGreaterThan(row.quantity, row.dispatchedQuantity));
  const previousStatus = fulfilment.status;
  fulfilment.status = allDispatched ? (poStatus === "fulfilled" ? "fulfilled" : "dispatched") : "partially_dispatched";
  fulfilment.vehicleNumber = vehicle;
  fulfilment.driverName = driver;
  fulfilment.dispatchedAt ??= ctx.nowIso();
  if (allDispatched) fulfilment.fulfilledAt = ctx.nowIso();
  if (input.notes.trim()) {
    fulfilment.notes = fulfilment.notes ? `${fulfilment.notes}\n${input.notes.trim()}` : input.notes.trim();
  }

  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Fulfilment Dispatched",
    entityType: "fulfilment",
    entityId: fulfilment.id,
    entityLabel: fulfilment.fulfilmentNumber,
    field: "status",
    previousValue: previousStatus,
    newValue: fulfilment.status,
  });

  return {
    fulfilmentId: fulfilment.id,
    fulfilmentStatus: fulfilment.status,
    dispatchedQuantity: total,
    customerPoStatus: poStatus,
  };
}

export function mockCancelPoReleasingAllocations(poId: string, reason: string, actorName: string) {
  const store = getStore();
  const { ctx, po } = requirePo(poId);
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error("A cancellation reason is required.");
  if (["cancelled", "fulfilled"].includes(po.status)) throw new Error(`Customer PO is already ${po.status}.`);

  const items = poItemsFor(poId);
  if (items.some((item) => item.fulfilledQuantity > 0)) {
    throw new Error("A purchase order with dispatched quantity cannot be cancelled.");
  }

  const itemIds = new Set(items.map((item) => item.id));
  const active = store.allocations.filter((row) => itemIds.has(row.customerPoItemId) && row.status === "active");
  let releasedQuantity = 0;

  for (const allocation of active) {
    const stock = findInventory(allocation.inventoryItemId);
    if (stock) {
      stock.reservedQuantity = roundQuantity(Math.max(stock.reservedQuantity - allocation.allocatedQuantity, 0));
      syncInventoryStatus(stock);
      pushMovement(
        "release",
        stock.id,
        allocation.allocatedQuantity,
        allocation.unit,
        "inventory_allocation",
        allocation.id,
        stock.quantity,
        stock.quantity,
        `Released reservation because ${po.poNumber} was cancelled. Stock quantity unchanged.`,
      );
    }
    allocation.status = "released";
    allocation.releasedAt = ctx.nowIso();
    allocation.releaseReason = `PO cancelled: ${cleanReason}`;
    releasedQuantity = roundQuantity(releasedQuantity + allocation.allocatedQuantity);
    pushAudit(store, {
      customerPoId: po.id,
      actorName,
      action: "Inventory Allocation Released",
      entityType: "inventory_allocation",
      entityId: allocation.id,
      entityLabel: po.poNumber,
      field: "status",
      previousValue: "active",
      newValue: "released",
    });
  }

  for (const fulfilment of store.fulfilments) {
    if (fulfilment.customerPoId === poId && ["draft", "ready"].includes(fulfilment.status)) {
      fulfilment.status = "cancelled";
    }
  }
  for (const row of store.finalQaqc) {
    if (row.customerPoId === poId) row.status = "cancelled";
  }
  for (const item of items) item.status = "cancelled";

  const previous = po.status;
  po.status = "cancelled";
  po.actionRequired = false;
  po.actionRequiredReason = null;
  po.actionRequiredAt = null;
  po.updatedAt = ctx.nowIso();
  ctx.pushHistory({
    customerPoId: po.id,
    fromStatus: previous,
    toStatus: "cancelled",
    changedByName: actorName,
    reason: cleanReason,
    notes: `Released ${active.length} allocation(s)`,
  });
  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Customer PO Cancelled",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "status",
    previousValue: previous,
    newValue: "cancelled",
  });

  return { customerPurchaseOrderId: po.id, releasedAllocations: active.length, releasedQuantity };
}

export function mockCancelFulfilment(fulfilmentId: string, reason: string, actorName: string) {
  const store = getStore();
  const fulfilment = store.fulfilments.find((row) => row.id === fulfilmentId);
  if (!fulfilment) throw new Error("Fulfilment not found.");
  if (!reason.trim()) throw new Error("A cancellation reason is required.");
  if (!["draft", "ready"].includes(fulfilment.status)) {
    throw new Error("Only draft or ready fulfilments can be cancelled.");
  }
  const { po } = requirePo(fulfilment.customerPoId);

  for (const allocation of store.allocations) {
    if (allocation.fulfilmentId === fulfilment.id && allocation.status === "active") {
      allocation.fulfilmentId = null;
    }
  }
  for (const row of store.finalQaqc) {
    if (row.fulfilmentId === fulfilment.id) row.status = "cancelled";
  }
  const previous = fulfilment.status;
  fulfilment.status = "cancelled";

  pushAudit(store, {
    customerPoId: po.id,
    actorName,
    action: "Fulfilment Cancelled",
    entityType: "fulfilment",
    entityId: fulfilment.id,
    entityLabel: fulfilment.fulfilmentNumber,
    field: "status",
    previousValue: previous,
    newValue: "cancelled",
  });
  return { fulfilmentId: fulfilment.id, status: "cancelled" as const };
}

function isBlockedQaqc(record: FulfilmentRecord): boolean {
  const result = record.finalQaqc?.result;
  if (!result) return false;
  return ["failed", "on_hold"].includes(result) && !record.canDispatch;
}

function bucketForFulfilment(record: FulfilmentRecord): OperationalFulfilmentBucket | null {
  if (record.status === "cancelled") return null;
  if (["dispatched", "fulfilled"].includes(record.status)) return "completed";
  if (isBlockedQaqc(record)) return "blocked_qaqc";
  if (record.status === "draft") return "awaiting_final_qaqc";
  if (["ready", "partially_dispatched"].includes(record.status) && record.canDispatch) {
    return "ready_to_dispatch";
  }
  // Ready/partial without canDispatch and without a failed QAQC (edge case) stays off the board.
  return null;
}

function createdByNameForFulfilment(store: Store, fulfilmentId: string): string | null {
  return (
    store.audits.find((row) => row.entityId === fulfilmentId && row.action === "Fulfilment Created")?.actorName ?? null
  );
}

function toOperationalRowFromFulfilment(
  store: Store,
  fulfilment: MockFulfilment,
  record: FulfilmentRecord,
): OperationalFulfilmentRow {
  const ctx = getMockCustomerOrderContext();
  const po = ctx.purchaseOrders.find((row) => row.id === fulfilment.customerPoId);
  const customer = po ? ctx.customers.find((row) => row.id === po.customerId) : undefined;
  const unit = record.items[0]?.unit ?? "kg";
  const batchNumbers = [...new Set(record.items.map((row) => row.batchNumber).filter(Boolean))].sort();
  const productSummary = [...new Set(record.items.map((row) => row.productName))].join(", ");

  return {
    fulfilmentId: record.id,
    fulfilmentNumber: record.fulfilmentNumber,
    customerPoId: fulfilment.customerPoId,
    poNumber: po?.poNumber ?? "",
    customerName: customer?.name ?? "",
    customerCode: customer?.customerCode ?? "",
    priority: po?.priority ?? "normal",
    requiredDeliveryDate: po?.requiredDeliveryDate ?? null,
    plannedDate: record.plannedDate,
    status: record.status,
    qaqcResult: record.finalQaqc?.result ?? null,
    canDispatch: record.canDispatch,
    totalQuantity: record.totalQuantity,
    dispatchedQuantity: record.dispatchedQuantity,
    remainingQuantity: roundQuantity(record.totalQuantity - record.dispatchedQuantity),
    unit,
    batchNumbers,
    productSummary,
    vehicleNumber: record.vehicleNumber,
    driverName: record.driverName,
    dispatchedAt: record.dispatchedAt,
    createdAt: record.createdAt,
    createdByName: createdByNameForFulfilment(store, fulfilment.id),
  };
}

function readyForFulfilmentRows(store: Store): OperationalFulfilmentRow[] {
  const ctx = getMockCustomerOrderContext();
  const rows: OperationalFulfilmentRow[] = [];

  for (const po of ctx.purchaseOrders) {
    if (!ALLOCATABLE_PO_STATUSES.includes(po.status) || po.status === "cancelled") continue;
    const itemIds = new Set(poItemsFor(po.id).map((item) => item.id));
    const unattached = store.allocations.filter(
      (row) =>
        itemIds.has(row.customerPoItemId) &&
        row.status === "active" &&
        row.fulfilmentId === null &&
        row.fulfilledQuantity === 0,
    );
    if (!unattached.length) continue;

    const reserved = roundQuantity(unattached.reduce((sum, row) => sum + openReserved(row), 0));
    const batchNumbers = [
      ...new Set(unattached.map((row) => findBatch(row.batchId)?.batchNumber ?? "").filter(Boolean)),
    ].sort();
    const productNames = new Set<string>();
    for (const allocation of unattached) {
      const item = ctx.items.find((row) => row.id === allocation.customerPoItemId);
      if (item) productNames.add(item.productName);
    }
    const customer = ctx.customers.find((row) => row.id === po.customerId);

    rows.push({
      fulfilmentId: "",
      fulfilmentNumber: "",
      customerPoId: po.id,
      poNumber: po.poNumber,
      customerName: customer?.name ?? "",
      customerCode: customer?.customerCode ?? "",
      priority: po.priority,
      requiredDeliveryDate: po.requiredDeliveryDate,
      plannedDate: null,
      status: po.status,
      qaqcResult: null,
      canDispatch: false,
      totalQuantity: reserved,
      dispatchedQuantity: 0,
      remainingQuantity: reserved,
      unit: unattached[0]?.unit ?? "kg",
      batchNumbers,
      productSummary: [...productNames].join(", "),
      vehicleNumber: null,
      driverName: null,
      dispatchedAt: null,
      createdAt: po.updatedAt,
      createdByName: null,
    });
  }

  return rows.sort((a, b) => {
    const left = a.requiredDeliveryDate ?? "";
    const right = b.requiredDeliveryDate ?? "";
    return left.localeCompare(right) || a.poNumber.localeCompare(b.poNumber);
  });
}

function buildTraceabilityLinks(
  items: Array<{ batchId: string; inventoryItemId: string }>,
): FulfilmentTraceabilityLink[] {
  const inventory = getMockInventoryContext();
  const seen = new Set<string>();
  const links: FulfilmentTraceabilityLink[] = [];

  for (const item of items) {
    const key = `${item.batchId}:${item.inventoryItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const stock = findInventory(item.inventoryItemId);
    const batchDetail = mockGetBatch(item.batchId);
    const run = stock?.processingRunId
      ? inventory.processingRuns.find((row) => row.id === stock.processingRunId)
      : undefined;

    links.push({
      batchId: item.batchId,
      batchNumber: batchDetail?.batchNumber ?? findBatch(item.batchId)?.batchNumber ?? "",
      inventoryItemId: item.inventoryItemId,
      inventoryType: (stock?.inventoryType ?? "processed") as FulfilmentTraceabilityLink["inventoryType"],
      processingRunId: stock?.processingRunId ?? null,
      processingRunNumber: run?.processingRunNumber ?? null,
      goodsReceiptId: batchDetail?.goodsReceiptId ?? "",
      receiptNumber: batchDetail?.receiptNumber ?? "",
      vendorId: batchDetail?.vendorId ?? "",
      vendorName: batchDetail?.vendorName ?? "",
    });
  }

  return links.sort((a, b) => a.batchNumber.localeCompare(b.batchNumber));
}

export function mockListOperationalFulfilments(): OperationalFulfilmentBoard {
  const store = getStore();
  const board: OperationalFulfilmentBoard = {
    ready_for_fulfilment: readyForFulfilmentRows(store),
    awaiting_final_qaqc: [],
    ready_to_dispatch: [],
    completed: [],
    blocked_qaqc: [],
  };

  for (const fulfilment of store.fulfilments) {
    const record = toFulfilmentRecord(store, fulfilment);
    const bucket = bucketForFulfilment(record);
    if (!bucket || bucket === "ready_for_fulfilment") continue;
    board[bucket].push(toOperationalRowFromFulfilment(store, fulfilment, record));
  }

  const byDelivery = (a: OperationalFulfilmentRow, b: OperationalFulfilmentRow) => {
    const left = a.requiredDeliveryDate ?? a.plannedDate ?? "";
    const right = b.requiredDeliveryDate ?? b.plannedDate ?? "";
    return left.localeCompare(right) || b.createdAt.localeCompare(a.createdAt);
  };

  (Object.keys(board) as OperationalFulfilmentBucket[])
    .filter((key) => key !== "ready_for_fulfilment")
    .forEach((key) => {
      board[key].sort(byDelivery);
    });

  return board;
}

export function mockGetFulfilmentWorkspace(fulfilmentId: string): FulfilmentWorkspaceDetail | null {
  const store = getStore();
  const fulfilment = store.fulfilments.find((row) => row.id === fulfilmentId);
  if (!fulfilment) return null;

  const ctx = getMockCustomerOrderContext();
  const po = ctx.purchaseOrders.find((row) => row.id === fulfilment.customerPoId);
  if (!po) return null;
  const customer = ctx.customers.find((row) => row.id === po.customerId);
  const record = toFulfilmentRecord(store, fulfilment);
  const qaqcResult = record.finalQaqc?.result ?? null;

  const items = store.fulfilmentItems
    .filter((row) => row.fulfilmentId === fulfilment.id)
    .map((row) => {
      const poItem = poItemsFor(po.id).find((item) => item.id === row.customerPoItemId);
      const allocation = store.allocations.find((candidate) => candidate.id === row.allocationId);
      const inventory = findInventory(row.inventoryItemId);
      return {
        id: row.id,
        customerPoItemId: row.customerPoItemId,
        lineNumber: poItem?.lineNumber ?? 0,
        productName: poItem?.productName ?? "Unknown item",
        allocationId: row.allocationId,
        inventoryItemId: row.inventoryItemId,
        batchId: row.batchId,
        batchNumber: findBatch(row.batchId)?.batchNumber ?? "",
        quantity: row.quantity,
        dispatchedQuantity: row.dispatchedQuantity,
        remainingQuantity: roundQuantity(row.quantity - row.dispatchedQuantity),
        unit: row.unit,
        inventoryType: (inventory?.inventoryType ?? "processed") as FulfilmentWorkspaceDetail["items"][number]["inventoryType"],
        allocatedQuantity: allocation?.allocatedQuantity ?? row.quantity,
        qaqcResult,
      };
    })
    .sort((a, b) => a.lineNumber - b.lineNumber || a.batchNumber.localeCompare(b.batchNumber));

  const traceability = buildTraceabilityLinks(
    items.map((row) => ({ batchId: row.batchId, inventoryItemId: row.inventoryItemId })),
  );

  return {
    ...record,
    items,
    customerPoId: po.id,
    poNumber: po.poNumber,
    customerName: customer?.name ?? "",
    customerCode: customer?.customerCode ?? "",
    priority: po.priority,
    requiredDeliveryDate: po.requiredDeliveryDate,
    poStatus: po.status,
    createdByName: createdByNameForFulfilment(store, fulfilment.id),
    traceability,
  };
}

/** Active reservation labels keyed by inventory item id (mock fulfilment store). */
export function mockAllocationLabelsByInventoryId(): Map<string, string> {
  const store = getStore();
  const ctx = getMockCustomerOrderContext();
  const partsByInventory = new Map<string, string[]>();

  for (const allocation of store.allocations) {
    if (allocation.status !== "active") continue;
    const open = openReserved(allocation);
    if (open <= 0) continue;

    const line = ctx.items.find((row) => row.id === allocation.customerPoItemId);
    const po = line ? ctx.purchaseOrders.find((row) => row.id === line.customerPoId) : undefined;
    const label = `${po?.poNumber ?? "PO"} · ${formatQuantity(open, allocation.unit)}`;
    const bucket = partsByInventory.get(allocation.inventoryItemId) ?? [];
    bucket.push(label);
    partsByInventory.set(allocation.inventoryItemId, bucket);
  }

  const result = new Map<string, string>();
  for (const [inventoryItemId, parts] of partsByInventory) {
    result.set(inventoryItemId, parts.join(", "));
  }
  return result;
}
