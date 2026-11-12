import "server-only";

import { asProfileId } from "@/lib/authz";
import {
  validateAllocationInput,
  validateCreateFulfilmentInput,
  validateDispatchInput,
  validateFinalQaqcInput,
  validateReason,
} from "@/lib/fulfillment-validation";
import {
  mockAllocateInventory,
  mockBatchFulfillmentUsage,
  mockCancelFulfilment,
  mockCancelPoReleasingAllocations,
  mockCreateFulfilment,
  mockDispatchFulfilment,
  mockFulfillmentDashboardStats,
  mockGetAvailableInventory,
  mockGetFulfillmentDetail,
  mockGetFulfillmentSummary,
  mockGetFulfilmentWorkspace,
  mockListFulfillmentAudits,
  mockListOperationalFulfilments,
  mockRecordFinalQaqc,
  mockReleaseAllocation,
} from "@/lib/mock/fulfillment-store";
import { quantityGreaterThan, roundQuantity } from "@/lib/quantity";
import { getSession } from "@/services/auth/get-session";
import { getDatabaseClient, getPersistenceMode } from "@/services/db/client";
import type { Database, InventoryType } from "@/types/database";
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
  ItemAvailability,
  ItemReconciliation,
  OperationalFulfilmentBoard,
  OperationalFulfilmentBucket,
  OperationalFulfilmentRow,
  ServiceResult,
} from "@/types/fulfillment";

type Tables = Database["public"]["Tables"];
type PoItemRow = Tables["customer_purchase_order_items"]["Row"];
type AllocationRow = Tables["inventory_allocations"]["Row"];
type InventoryRow = Tables["inventory_items"]["Row"];
type FulfilmentRow = Tables["fulfilments"]["Row"];
type FulfilmentItemRow = Tables["fulfilment_items"]["Row"];
type FinalQaqcRow = Tables["final_qaqc"]["Row"];
type NestedRow = { [key: string]: unknown };

const SELLABLE_TYPES: InventoryType[] = ["processed", "frozen"];

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail<T = never>(error: string, fieldErrors?: Record<string, string>): ServiceResult<T> {
  return { ok: false, error, fieldErrors };
}

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

function cleanRpcMessage(message: string): string {
  return message.replace(/^.*exception:\s*/i, "") || "Unable to complete the request.";
}

function num(value: unknown): number {
  return roundQuantity(Number(value ?? 0));
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

function productMatches(inventorySpecies: string, item: { species: string; productName: string }): boolean {
  const target = inventorySpecies.trim().toLowerCase();
  return [item.species, item.productName].some((value) => value.trim().toLowerCase() === target);
}

function openReserved(row: AllocationRow): number {
  return row.status === "active" ? roundQuantity(num(row.allocated_quantity) - num(row.fulfilled_quantity)) : 0;
}

function reconcile(items: PoItemRow[], allocations: AllocationRow[]): ItemReconciliation[] {
  return items
    .filter((item) => item.status !== "cancelled")
    .sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
    .map((item) => {
      const allocated = roundQuantity(
        allocations
          .filter((row) => row.customer_purchase_order_item_id === item.id)
          .reduce((sum, row) => sum + openReserved(row), 0),
      );
      const requested = num(item.requested_quantity);
      const fulfilled = num(item.fulfilled_quantity);
      return {
        customerPoItemId: item.id,
        lineNumber: Number(item.line_number ?? 0),
        productName: item.product_name ?? item.product_species,
        species: item.product_species,
        unit: item.unit,
        requestedQuantity: requested,
        allocatedQuantity: allocated,
        fulfilledQuantity: fulfilled,
        remainingQuantity: roundQuantity(requested - fulfilled),
        unallocatedQuantity: Math.max(roundQuantity(requested - fulfilled - allocated), 0),
      };
    });
}

async function loadPoRows(poId: string) {
  const client = await getClient();
  const { data: po, error: poError } = await client
    .from("customer_purchase_orders")
    .select("id, po_number, status")
    .eq("id", poId)
    .maybeSingle();
  if (poError) throw new Error("Unable to load customer purchase order.");
  if (!po) return null;

  const { data: itemRows, error: itemError } = await client
    .from("customer_purchase_order_items")
    .select("*")
    .eq("customer_purchase_order_id", poId);
  if (itemError) throw new Error("Unable to load purchase order items.");
  const items = (itemRows ?? []) as PoItemRow[];
  const itemIds = items.map((item) => item.id);

  let allocations: AllocationRow[] = [];
  if (itemIds.length) {
    const { data, error } = await client
      .from("inventory_allocations")
      .select("*")
      .in("customer_purchase_order_item_id", itemIds);
    if (error) throw new Error("Unable to load inventory allocations.");
    allocations = (data ?? []) as AllocationRow[];
  }

  return { client, po, items, allocations };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAvailableInventoryForCustomerOrder(
  poId: string,
): Promise<AvailableInventoryForOrder | null> {
  if (getPersistenceMode() === "mock") return mockGetAvailableInventory(poId);

  const loaded = await loadPoRows(poId);
  if (!loaded) return null;
  const { client, po, items, allocations } = loaded;
  const reconciled = reconcile(items, allocations);

  const { data: stockRows, error } = await client
    .from("inventory_items")
    .select("*")
    .in("inventory_type", SELLABLE_TYPES)
    .in("status", ["available", "reserved"]);
  if (error) throw new Error("Unable to load available inventory.");
  const stock = (stockRows ?? []) as InventoryRow[];

  const batchIds = [...new Set(stock.map((row) => row.batch_id))];
  const runIds = [...new Set(stock.map((row) => row.processing_run_id).filter((id): id is string => Boolean(id)))];
  const batchMap = new Map<string, { batchNumber: string; receivedAt: string }>();
  const runMap = new Map<string, string>();

  if (batchIds.length) {
    const { data } = await client.from("batches").select("id, batch_number, received_at").in("id", batchIds);
    for (const row of (data ?? []) as NestedRow[]) {
      batchMap.set(row.id as string, {
        batchNumber: row.batch_number as string,
        receivedAt: row.received_at as string,
      });
    }
  }
  if (runIds.length) {
    const { data } = await client.from("processing_runs").select("id, processing_run_number").in("id", runIds);
    for (const row of (data ?? []) as NestedRow[]) runMap.set(row.id as string, row.processing_run_number as string);
  }

  const result: ItemAvailability[] = reconciled.map((entry) => {
    const options = stock
      .filter(
        (row) =>
          row.unit === entry.unit &&
          productMatches(row.product_species, entry) &&
          quantityGreaterThan(num(row.quantity), num(row.reserved_quantity)),
      )
      .sort((a, b) => {
        const left = batchMap.get(a.batch_id)?.receivedAt ?? "";
        const right = batchMap.get(b.batch_id)?.receivedAt ?? "";
        return left.localeCompare(right);
      })
      .map(
        (row): AvailableInventoryOption => ({
          inventoryItemId: row.id,
          batchId: row.batch_id,
          batchNumber: batchMap.get(row.batch_id)?.batchNumber ?? "",
          inventoryType: row.inventory_type,
          productSpecies: row.product_species,
          totalQuantity: num(row.quantity),
          reservedQuantity: num(row.reserved_quantity),
          availableQuantity: roundQuantity(num(row.quantity) - num(row.reserved_quantity)),
          unit: row.unit,
          storageLocation: row.storage_location,
          processingRunNumber: row.processing_run_id ? (runMap.get(row.processing_run_id) ?? null) : null,
        }),
      );

    return {
      customerPoItemId: entry.customerPoItemId,
      lineNumber: entry.lineNumber,
      productName: entry.productName,
      species: entry.species,
      unit: entry.unit,
      requestedQuantity: entry.requestedQuantity,
      fulfilledQuantity: entry.fulfilledQuantity,
      allocatedQuantity: entry.allocatedQuantity,
      unallocatedQuantity: entry.unallocatedQuantity,
      options,
    };
  });

  return { customerPoId: po.id, poNumber: po.po_number, items: result };
}

export async function getCustomerPoFulfillmentDetail(
  poId: string,
): Promise<CustomerPoFulfillmentDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetFulfillmentDetail(poId);

  const loaded = await loadPoRows(poId);
  if (!loaded) return null;
  const { client, po, items, allocations } = loaded;

  const { data: fulfilmentData, error: fulfilmentError } = await client
    .from("fulfilments")
    .select("*")
    .eq("customer_purchase_order_id", poId)
    .order("created_at", { ascending: false });
  if (fulfilmentError) throw new Error("Unable to load fulfilments.");
  const fulfilments = (fulfilmentData ?? []) as FulfilmentRow[];
  const fulfilmentIds = fulfilments.map((row) => row.id);

  let fulfilmentItems: FulfilmentItemRow[] = [];
  let qaqcRows: FinalQaqcRow[] = [];
  if (fulfilmentIds.length) {
    const { data: itemData } = await client.from("fulfilment_items").select("*").in("fulfilment_id", fulfilmentIds);
    fulfilmentItems = (itemData ?? []) as FulfilmentItemRow[];
    const { data: qaqcData } = await client.from("final_qaqc").select("*").in("fulfilment_id", fulfilmentIds);
    qaqcRows = (qaqcData ?? []) as FinalQaqcRow[];
  }

  const batchIds = [
    ...new Set([...allocations.map((row) => row.batch_id), ...fulfilmentItems.map((row) => row.batch_id)]),
  ];
  const inventoryIds = [...new Set(allocations.map((row) => row.inventory_item_id))];
  const batchNumbers = new Map<string, string>();
  const inventoryTypes = new Map<string, InventoryType>();
  const inspectors = new Map<string, string>();

  if (batchIds.length) {
    const { data } = await client.from("batches").select("id, batch_number").in("id", batchIds);
    for (const row of (data ?? []) as NestedRow[]) batchNumbers.set(row.id as string, row.batch_number as string);
  }
  if (inventoryIds.length) {
    const { data } = await client.from("inventory_items").select("id, inventory_type").in("id", inventoryIds);
    for (const row of (data ?? []) as NestedRow[]) {
      inventoryTypes.set(row.id as string, row.inventory_type as InventoryType);
    }
  }
  if (qaqcRows.length) {
    const { data } = await client
      .from("audit_logs")
      .select("entity_id, actor_name, created_at")
      .eq("entity_type", "final_qaqc")
      .in("entity_id", qaqcRows.map((row) => row.id))
      .order("created_at", { ascending: false });
    for (const row of (data ?? []) as NestedRow[]) {
      const key = row.entity_id as string;
      if (!inspectors.has(key)) inspectors.set(key, row.actor_name as string);
    }
  }

  const itemById = new Map(items.map((item) => [item.id, item]));
  const fulfilmentNumberById = new Map(fulfilments.map((row) => [row.id, row.fulfilment_number]));
  const reconciled = reconcile(items, allocations);

  const allocationRecords: AllocationRecord[] = allocations
    .map((row) => {
      const item = itemById.get(row.customer_purchase_order_item_id);
      return {
        id: row.id,
        customerPoItemId: row.customer_purchase_order_item_id,
        lineNumber: Number(item?.line_number ?? 0),
        productName: item?.product_name ?? item?.product_species ?? "Unknown item",
        fulfilmentId: row.fulfilment_id,
        fulfilmentNumber: row.fulfilment_id ? (fulfilmentNumberById.get(row.fulfilment_id) ?? null) : null,
        inventoryItemId: row.inventory_item_id,
        batchId: row.batch_id,
        batchNumber: batchNumbers.get(row.batch_id) ?? "",
        inventoryType: inventoryTypes.get(row.inventory_item_id) ?? "processed",
        allocatedQuantity: num(row.allocated_quantity),
        fulfilledQuantity: num(row.fulfilled_quantity),
        reservedQuantity: openReserved(row),
        unit: row.unit,
        status: row.status,
        allocatedAt: row.allocated_at,
        releasedAt: row.released_at,
        releaseReason: row.release_reason,
      } satisfies AllocationRecord;
    })
    .sort((a, b) => a.allocatedAt.localeCompare(b.allocatedAt) || a.lineNumber - b.lineNumber);

  const fulfilmentRecords: FulfilmentRecord[] = fulfilments.map((row) => {
    const rowItems: FulfilmentItemRecord[] = fulfilmentItems
      .filter((item) => item.fulfilment_id === row.id)
      .map((item) => {
        const poItem = itemById.get(item.customer_purchase_order_item_id);
        return {
          id: item.id,
          customerPoItemId: item.customer_purchase_order_item_id,
          lineNumber: Number(poItem?.line_number ?? 0),
          productName: poItem?.product_name ?? poItem?.product_species ?? "Unknown item",
          allocationId: item.allocation_id,
          inventoryItemId: item.inventory_item_id,
          batchId: item.batch_id,
          batchNumber: batchNumbers.get(item.batch_id) ?? "",
          quantity: num(item.quantity),
          dispatchedQuantity: num(item.dispatched_quantity),
          remainingQuantity: roundQuantity(num(item.quantity) - num(item.dispatched_quantity)),
          unit: item.unit,
        };
      })
      .sort((a, b) => a.lineNumber - b.lineNumber || a.batchNumber.localeCompare(b.batchNumber));

    const qaqcRow = qaqcRows.find((candidate) => candidate.fulfilment_id === row.id && candidate.status !== "cancelled");
    const finalQaqc: FinalQaqcRecord | null = qaqcRow
      ? {
          id: qaqcRow.id,
          fulfilmentId: row.id,
          inspectionDate: qaqcRow.inspection_date,
          result: qaqcRow.result,
          quantityChecked: qaqcRow.quantity_checked == null ? null : num(qaqcRow.quantity_checked),
          notes: qaqcRow.notes,
          status: qaqcRow.status,
          inspectorName: inspectors.get(qaqcRow.id) ?? null,
          recordedAt: qaqcRow.updated_at,
        }
      : null;

    const total = roundQuantity(rowItems.reduce((sum, item) => sum + item.quantity, 0));
    const dispatched = roundQuantity(rowItems.reduce((sum, item) => sum + item.dispatchedQuantity, 0));
    const qaqcOk = finalQaqc ? ["passed", "conditional"].includes(finalQaqc.result ?? "") : false;

    return {
      id: row.id,
      fulfilmentNumber: row.fulfilment_number,
      status: row.status,
      plannedDate: row.planned_date,
      vehicleNumber: row.vehicle_number,
      driverName: row.driver_name,
      dispatchedAt: row.dispatched_at,
      fulfilledAt: row.fulfilled_at,
      notes: row.notes,
      createdAt: row.created_at,
      items: rowItems,
      finalQaqc,
      totalQuantity: total,
      dispatchedQuantity: dispatched,
      canDispatch:
        ["ready", "partially_dispatched"].includes(row.status) && qaqcOk && quantityGreaterThan(total, dispatched),
    };
  });

  return {
    customerPoId: po.id,
    poNumber: po.po_number,
    poStatus: po.status,
    items: reconciled,
    totals: sumTotals(reconciled),
    allocations: allocationRecords,
    fulfilments: fulfilmentRecords,
  };
}

/** Compact summary for the customer PO detail model. */
export async function getCustomerPoFulfillmentSummary(poId: string): Promise<CustomerPoFulfillmentSummary> {
  if (getPersistenceMode() === "mock") return mockGetFulfillmentSummary(poId);
  const detail = await getCustomerPoFulfillmentDetail(poId);
  if (!detail) {
    return {
      requestedQuantity: 0,
      allocatedQuantity: 0,
      fulfilledQuantity: 0,
      remainingQuantity: 0,
      unallocatedQuantity: 0,
      activeAllocationCount: 0,
      fulfilmentCount: 0,
    };
  }
  return {
    ...detail.totals,
    activeAllocationCount: detail.allocations.filter((row) => row.status === "active").length,
    fulfilmentCount: detail.fulfilments.filter((row) => row.status !== "cancelled").length,
  };
}

/** Mock-mode audit rows for the PO detail page. Supabase audit rows come from audit_logs metadata. */
export function listMockFulfillmentAuditsForPo(poId: string) {
  return mockListFulfillmentAudits(poId);
}

export async function getFulfillmentDashboardStats(): Promise<FulfillmentDashboardStats> {
  if (getPersistenceMode() === "mock") return mockFulfillmentDashboardStats();

  const client = await getClient();
  const { data, error } = await client.from("fulfilments").select("status");
  if (error) throw new Error("Unable to load fulfilment dashboard stats.");
  const rows = (data ?? []) as NestedRow[];
  return {
    awaitingFinalQaqc: rows.filter((row) => row.status === "draft").length,
    readyForDispatch: rows.filter((row) => ["ready", "partially_dispatched"].includes(String(row.status))).length,
  };
}

const ALLOCATABLE_PO_STATUSES = [
  "approved",
  "partially_allocated",
  "ready_for_fulfillment",
  "partially_fulfilled",
];

function isBlockedQaqcRecord(record: FulfilmentRecord): boolean {
  const result = record.finalQaqc?.result;
  if (!result) return false;
  return ["failed", "on_hold"].includes(result) && !record.canDispatch;
}

function bucketForFulfilmentRecord(record: FulfilmentRecord): OperationalFulfilmentBucket | null {
  if (record.status === "cancelled") return null;
  if (["dispatched", "fulfilled"].includes(record.status)) return "completed";
  if (isBlockedQaqcRecord(record)) return "blocked_qaqc";
  if (record.status === "draft") return "awaiting_final_qaqc";
  if (["ready", "partially_dispatched"].includes(record.status) && record.canDispatch) {
    return "ready_to_dispatch";
  }
  return null;
}

function sortOperationalRows(rows: OperationalFulfilmentRow[]): OperationalFulfilmentRow[] {
  return [...rows].sort((a, b) => {
    const left = a.requiredDeliveryDate ?? a.plannedDate ?? "";
    const right = b.requiredDeliveryDate ?? b.plannedDate ?? "";
    return left.localeCompare(right) || b.createdAt.localeCompare(a.createdAt);
  });
}

export async function listOperationalFulfilments(): Promise<OperationalFulfilmentBoard> {
  if (getPersistenceMode() === "mock") return mockListOperationalFulfilments();

  const client = await getClient();
  const board: OperationalFulfilmentBoard = {
    ready_for_fulfilment: [],
    awaiting_final_qaqc: [],
    ready_to_dispatch: [],
    completed: [],
    blocked_qaqc: [],
  };

  const { data: fulfilmentData, error: fulfilmentError } = await client
    .from("fulfilments")
    .select(
      "*, customer_purchase_orders!inner(id, po_number, status, customer_name, customer_id, priority, required_date, updated_at, customers(customer_code))",
    )
    .neq("status", "cancelled");
  if (fulfilmentError) throw new Error("Unable to load operational fulfilments.");

  const fulfilments = (fulfilmentData ?? []) as NestedRow[];
  const fulfilmentIds = fulfilments.map((row) => row.id as string);

  let fulfilmentItems: FulfilmentItemRow[] = [];
  let qaqcRows: FinalQaqcRow[] = [];
  if (fulfilmentIds.length) {
    const { data: itemData } = await client.from("fulfilment_items").select("*").in("fulfilment_id", fulfilmentIds);
    fulfilmentItems = (itemData ?? []) as FulfilmentItemRow[];
    const { data: qaqcData } = await client.from("final_qaqc").select("*").in("fulfilment_id", fulfilmentIds);
    qaqcRows = (qaqcData ?? []) as FinalQaqcRow[];
  }

  const batchIds = [...new Set(fulfilmentItems.map((row) => row.batch_id))];
  const batchNumbers = new Map<string, string>();
  if (batchIds.length) {
    const { data } = await client.from("batches").select("id, batch_number").in("id", batchIds);
    for (const row of (data ?? []) as NestedRow[]) batchNumbers.set(row.id as string, row.batch_number as string);
  }

  const poItemIds = [...new Set(fulfilmentItems.map((row) => row.customer_purchase_order_item_id))];
  const poItems = new Map<string, PoItemRow>();
  if (poItemIds.length) {
    const { data } = await client
      .from("customer_purchase_order_items")
      .select("*")
      .in("id", poItemIds);
    for (const row of (data ?? []) as PoItemRow[]) poItems.set(row.id, row);
  }

  const createdByIds = [
    ...new Set(fulfilments.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
  ];
  const createdByNames = new Map<string, string>();
  if (createdByIds.length) {
    const { data } = await client.from("profiles").select("id, full_name").in("id", createdByIds);
    for (const row of (data ?? []) as NestedRow[]) {
      createdByNames.set(row.id as string, (row.full_name as string) ?? "");
    }
  }

  for (const row of fulfilments) {
    const po = row.customer_purchase_orders as NestedRow;
    const rowItems = fulfilmentItems.filter((item) => item.fulfilment_id === row.id);
    const itemRecords: FulfilmentItemRecord[] = rowItems
      .map((item) => {
        const poItem = poItems.get(item.customer_purchase_order_item_id);
        return {
          id: item.id,
          customerPoItemId: item.customer_purchase_order_item_id,
          lineNumber: Number(poItem?.line_number ?? 0),
          productName: poItem?.product_name ?? poItem?.product_species ?? "Unknown item",
          allocationId: item.allocation_id,
          inventoryItemId: item.inventory_item_id,
          batchId: item.batch_id,
          batchNumber: batchNumbers.get(item.batch_id) ?? "",
          quantity: num(item.quantity),
          dispatchedQuantity: num(item.dispatched_quantity),
          remainingQuantity: roundQuantity(num(item.quantity) - num(item.dispatched_quantity)),
          unit: item.unit,
        };
      })
      .sort((a, b) => a.lineNumber - b.lineNumber);

    const qaqcRow = qaqcRows.find((candidate) => candidate.fulfilment_id === row.id && candidate.status !== "cancelled");
    const finalQaqc: FinalQaqcRecord | null = qaqcRow
      ? {
          id: qaqcRow.id,
          fulfilmentId: row.id as string,
          inspectionDate: qaqcRow.inspection_date,
          result: qaqcRow.result,
          quantityChecked: qaqcRow.quantity_checked == null ? null : num(qaqcRow.quantity_checked),
          notes: qaqcRow.notes,
          status: qaqcRow.status,
          inspectorName: null,
          recordedAt: qaqcRow.updated_at,
        }
      : null;

    const total = roundQuantity(itemRecords.reduce((sum, item) => sum + item.quantity, 0));
    const dispatched = roundQuantity(itemRecords.reduce((sum, item) => sum + item.dispatchedQuantity, 0));
    const qaqcOk = finalQaqc ? ["passed", "conditional"].includes(finalQaqc.result ?? "") : false;
    const record: FulfilmentRecord = {
      id: row.id as string,
      fulfilmentNumber: row.fulfilment_number as string,
      status: row.status as FulfilmentRecord["status"],
      plannedDate: row.planned_date as string | null,
      vehicleNumber: row.vehicle_number as string | null,
      driverName: row.driver_name as string | null,
      dispatchedAt: row.dispatched_at as string | null,
      fulfilledAt: row.fulfilled_at as string | null,
      notes: row.notes as string | null,
      createdAt: row.created_at as string,
      items: itemRecords,
      finalQaqc,
      totalQuantity: total,
      dispatchedQuantity: dispatched,
      canDispatch:
        ["ready", "partially_dispatched"].includes(String(row.status)) && qaqcOk && quantityGreaterThan(total, dispatched),
    };

    const bucket = bucketForFulfilmentRecord(record);
    if (!bucket) continue;

    const batchList = [...new Set(itemRecords.map((item) => item.batchNumber).filter(Boolean))].sort();
    const productSummary = [...new Set(itemRecords.map((item) => item.productName))].join(", ");
    const createdBy = row.created_by as string | null;

    const customerJoin = po.customers as NestedRow | NestedRow[] | null;
    const customerRow = Array.isArray(customerJoin) ? customerJoin[0] : customerJoin;

    board[bucket].push({
      fulfilmentId: record.id,
      fulfilmentNumber: record.fulfilmentNumber,
      customerPoId: po.id as string,
      poNumber: po.po_number as string,
      customerName: po.customer_name as string,
      customerCode: (customerRow?.customer_code as string) ?? "",
      priority: po.priority as OperationalFulfilmentRow["priority"],
      requiredDeliveryDate: (po.required_date as string | null) ?? null,
      plannedDate: record.plannedDate,
      status: record.status,
      qaqcResult: finalQaqc?.result ?? null,
      canDispatch: record.canDispatch,
      totalQuantity: total,
      dispatchedQuantity: dispatched,
      remainingQuantity: roundQuantity(total - dispatched),
      unit: itemRecords[0]?.unit ?? "kg",
      batchNumbers: batchList,
      productSummary,
      vehicleNumber: record.vehicleNumber,
      driverName: record.driverName,
      dispatchedAt: record.dispatchedAt,
      createdAt: record.createdAt,
      createdByName: createdBy ? (createdByNames.get(createdBy) ?? null) : null,
    });
  }

  const { data: allocationData, error: allocationError } = await client
    .from("inventory_allocations")
    .select(
      "*, customer_purchase_order_items!inner(customer_purchase_order_id, product_name, customer_purchase_orders!inner(id, po_number, status, customer_name, customer_id, priority, required_date, updated_at, customers(customer_code)))",
    )
    .eq("status", "active")
    .is("fulfilment_id", null)
    .eq("fulfilled_quantity", 0);
  if (allocationError) throw new Error("Unable to load ready-for-fulfilment allocations.");

  const readyByPo = new Map<string, OperationalFulfilmentRow>();
  for (const row of (allocationData ?? []) as NestedRow[]) {
    const poItem = row.customer_purchase_order_items as NestedRow;
    const po = poItem.customer_purchase_orders as NestedRow;
    const poStatus = String(po.status);
    if (!(ALLOCATABLE_PO_STATUSES as string[]).includes(poStatus) || poStatus === "cancelled") continue;

    const poId = po.id as string;
    const open = roundQuantity(num(row.allocated_quantity) - num(row.fulfilled_quantity));
    if (open <= 0) continue;

    const batchId = String(row.batch_id ?? "");
    const batchNumber = batchNumbers.get(batchId);
    if (batchId && batchNumber == null) {
      const { data } = await client.from("batches").select("batch_number").eq("id", batchId).maybeSingle();
      if (data) batchNumbers.set(batchId, (data as NestedRow).batch_number as string);
    }
    const resolvedBatch = batchNumbers.get(batchId) ?? "";
    const readyCustomerJoin = po.customers as NestedRow | NestedRow[] | null;
    const readyCustomer = Array.isArray(readyCustomerJoin) ? readyCustomerJoin[0] : readyCustomerJoin;

    const existing = readyByPo.get(poId);
    if (existing) {
      existing.totalQuantity = roundQuantity(existing.totalQuantity + open);
      existing.remainingQuantity = existing.totalQuantity;
      if (resolvedBatch && !existing.batchNumbers.includes(resolvedBatch)) {
        existing.batchNumbers.push(resolvedBatch);
        existing.batchNumbers.sort();
      }
      const productName = poItem.product_name as string;
      if (productName && !existing.productSummary.includes(productName)) {
        existing.productSummary = existing.productSummary ? `${existing.productSummary}, ${productName}` : productName;
      }
      continue;
    }

    readyByPo.set(poId, {
      fulfilmentId: "",
      fulfilmentNumber: "",
      customerPoId: poId,
      poNumber: po.po_number as string,
      customerName: po.customer_name as string,
      customerCode: (readyCustomer?.customer_code as string) ?? "",
      priority: po.priority as OperationalFulfilmentRow["priority"],
      requiredDeliveryDate: (po.required_date as string | null) ?? null,
      plannedDate: null,
      status: poStatus,
      qaqcResult: null,
      canDispatch: false,
      totalQuantity: open,
      dispatchedQuantity: 0,
      remainingQuantity: open,
      unit: row.unit as string,
      batchNumbers: resolvedBatch ? [resolvedBatch] : [],
      productSummary: (poItem.product_name as string) ?? "",
      vehicleNumber: null,
      driverName: null,
      dispatchedAt: null,
      createdAt: (po.updated_at as string) ?? new Date().toISOString(),
      createdByName: null,
    });
  }

  board.ready_for_fulfilment = sortOperationalRows([...readyByPo.values()]);
  (Object.keys(board) as OperationalFulfilmentBucket[])
    .filter((key) => key !== "ready_for_fulfilment")
    .forEach((key) => {
      board[key] = sortOperationalRows(board[key]);
    });

  return board;
}

export async function getFulfilmentWorkspace(fulfilmentId: string): Promise<FulfilmentWorkspaceDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetFulfilmentWorkspace(fulfilmentId);

  const client = await getClient();
  const { data: fulfilment, error } = await client
    .from("fulfilments")
    .select(
      "*, customer_purchase_orders!inner(id, po_number, status, customer_name, customer_id, priority, required_date, customers(customer_code))",
    )
    .eq("id", fulfilmentId)
    .maybeSingle();
  if (error) throw new Error("Unable to load fulfilment workspace.");
  if (!fulfilment) return null;

  const po = (fulfilment as NestedRow).customer_purchase_orders as NestedRow;
  const poId = po.id as string;
  const workspaceCustomerJoin = po.customers as NestedRow | NestedRow[] | null;
  const workspaceCustomer = Array.isArray(workspaceCustomerJoin) ? workspaceCustomerJoin[0] : workspaceCustomerJoin;

  const { data: itemData } = await client.from("fulfilment_items").select("*").eq("fulfilment_id", fulfilmentId);
  const fulfilmentItems = (itemData ?? []) as FulfilmentItemRow[];

  const { data: qaqcData } = await client
    .from("final_qaqc")
    .select("*")
    .eq("fulfilment_id", fulfilmentId)
    .neq("status", "cancelled")
    .maybeSingle();
  const qaqcRow = (qaqcData ?? null) as FinalQaqcRow | null;

  const allocationIds = fulfilmentItems.map((row) => row.allocation_id).filter((id): id is string => Boolean(id));
  const allocations = new Map<string, AllocationRow>();
  if (allocationIds.length) {
    const { data } = await client.from("inventory_allocations").select("*").in("id", allocationIds);
    for (const row of (data ?? []) as AllocationRow[]) allocations.set(row.id, row);
  }

  const poItemIds = fulfilmentItems.map((row) => row.customer_purchase_order_item_id);
  const poItems = new Map<string, PoItemRow>();
  if (poItemIds.length) {
    const { data } = await client.from("customer_purchase_order_items").select("*").in("id", poItemIds);
    for (const row of (data ?? []) as PoItemRow[]) poItems.set(row.id, row);
  }

  const inventoryIds = fulfilmentItems.map((row) => row.inventory_item_id);
  const inventoryTypes = new Map<string, InventoryType>();
  const inventoryRuns = new Map<string, string | null>();
  if (inventoryIds.length) {
    const { data } = await client.from("inventory_items").select("id, inventory_type, processing_run_id").in("id", inventoryIds);
    for (const row of (data ?? []) as NestedRow[]) {
      inventoryTypes.set(row.id as string, row.inventory_type as InventoryType);
      inventoryRuns.set(row.id as string, (row.processing_run_id as string | null) ?? null);
    }
  }

  const batchIds = [...new Set(fulfilmentItems.map((row) => row.batch_id))];
  const batchNumbers = new Map<string, string>();
  const batchReceipts = new Map<string, string>();
  if (batchIds.length) {
    const { data } = await client.from("batches").select("id, batch_number, goods_receipt_id").in("id", batchIds);
    for (const row of (data ?? []) as NestedRow[]) {
      batchNumbers.set(row.id as string, row.batch_number as string);
      batchReceipts.set(row.id as string, row.goods_receipt_id as string);
    }
  }

  const runIds = [...new Set([...inventoryRuns.values()].filter((id): id is string => Boolean(id)))];
  const runNumbers = new Map<string, string>();
  if (runIds.length) {
    const { data } = await client.from("processing_runs").select("id, processing_run_number").in("id", runIds);
    for (const row of (data ?? []) as NestedRow[]) runNumbers.set(row.id as string, row.processing_run_number as string);
  }

  const receiptIds = [...new Set(batchReceipts.values())];
  const receipts = new Map<string, { receiptNumber: string; purchaseOrderId: string | null }>();
  if (receiptIds.length) {
    const { data } = await client.from("goods_receipts").select("id, receipt_number, purchase_order_id").in("id", receiptIds);
    for (const row of (data ?? []) as NestedRow[]) {
      receipts.set(row.id as string, {
        receiptNumber: row.receipt_number as string,
        purchaseOrderId: (row.purchase_order_id as string | null) ?? null,
      });
    }
  }

  const purchaseOrderIds = [
    ...new Set([...receipts.values()].map((row) => row.purchaseOrderId).filter((id): id is string => Boolean(id))),
  ];
  const vendorByPurchaseOrder = new Map<string, string>();
  if (purchaseOrderIds.length) {
    const { data } = await client.from("purchase_orders").select("id, vendor_id").in("id", purchaseOrderIds);
    for (const row of (data ?? []) as NestedRow[]) {
      vendorByPurchaseOrder.set(row.id as string, row.vendor_id as string);
    }
  }

  const vendorIds = [...new Set(vendorByPurchaseOrder.values())];
  const vendorNames = new Map<string, string>();
  if (vendorIds.length) {
    const { data } = await client.from("vendors").select("id, vendor_name").in("id", vendorIds);
    for (const row of (data ?? []) as NestedRow[]) vendorNames.set(row.id as string, row.vendor_name as string);
  }

  let createdByName: string | null = null;
  if ((fulfilment as NestedRow).created_by) {
    const { data } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", (fulfilment as NestedRow).created_by as string)
      .maybeSingle();
    createdByName = (data as NestedRow | null)?.full_name ? String((data as NestedRow).full_name) : null;
  }

  const qaqcResult = qaqcRow?.result ?? null;
  const itemRecords: FulfilmentWorkspaceDetail["items"] = fulfilmentItems
    .map((item) => {
      const poItem = poItems.get(item.customer_purchase_order_item_id);
      const allocation = item.allocation_id ? allocations.get(item.allocation_id) : undefined;
      return {
        id: item.id,
        customerPoItemId: item.customer_purchase_order_item_id,
        lineNumber: Number(poItem?.line_number ?? 0),
        productName: poItem?.product_name ?? poItem?.product_species ?? "Unknown item",
        allocationId: item.allocation_id,
        inventoryItemId: item.inventory_item_id,
        batchId: item.batch_id,
        batchNumber: batchNumbers.get(item.batch_id) ?? "",
        quantity: num(item.quantity),
        dispatchedQuantity: num(item.dispatched_quantity),
        remainingQuantity: roundQuantity(num(item.quantity) - num(item.dispatched_quantity)),
        unit: item.unit,
        inventoryType: inventoryTypes.get(item.inventory_item_id) ?? "processed",
        allocatedQuantity: allocation ? num(allocation.allocated_quantity) : num(item.quantity),
        qaqcResult,
      };
    })
    .sort((a, b) => a.lineNumber - b.lineNumber || a.batchNumber.localeCompare(b.batchNumber));

  const traceability: FulfilmentTraceabilityLink[] = [];
  const seen = new Set<string>();
  for (const item of itemRecords) {
    const key = `${item.batchId}:${item.inventoryItemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const receiptId = batchReceipts.get(item.batchId) ?? "";
    const receipt = receiptId ? receipts.get(receiptId) : undefined;
    const vendorId = receipt?.purchaseOrderId ? (vendorByPurchaseOrder.get(receipt.purchaseOrderId) ?? "") : "";
    const runId = inventoryRuns.get(item.inventoryItemId) ?? null;
    traceability.push({
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      inventoryItemId: item.inventoryItemId,
      inventoryType: item.inventoryType,
      processingRunId: runId,
      processingRunNumber: runId ? (runNumbers.get(runId) ?? null) : null,
      goodsReceiptId: receiptId,
      receiptNumber: receipt?.receiptNumber ?? "",
      vendorId,
      vendorName: vendorId ? (vendorNames.get(vendorId) ?? "") : "",
    });
  }

  const total = roundQuantity(itemRecords.reduce((sum, item) => sum + item.quantity, 0));
  const dispatched = roundQuantity(itemRecords.reduce((sum, item) => sum + item.dispatchedQuantity, 0));
  const finalQaqc: FinalQaqcRecord | null = qaqcRow
    ? {
        id: qaqcRow.id,
        fulfilmentId: fulfilmentId,
        inspectionDate: qaqcRow.inspection_date,
        result: qaqcRow.result,
        quantityChecked: qaqcRow.quantity_checked == null ? null : num(qaqcRow.quantity_checked),
        notes: qaqcRow.notes,
        status: qaqcRow.status,
        inspectorName: null,
        recordedAt: qaqcRow.updated_at,
      }
    : null;
  const qaqcOk = finalQaqc ? ["passed", "conditional"].includes(finalQaqc.result ?? "") : false;
  const fulfilmentRow = fulfilment as FulfilmentRow;

  return {
    id: fulfilmentRow.id,
    fulfilmentNumber: fulfilmentRow.fulfilment_number,
    status: fulfilmentRow.status,
    plannedDate: fulfilmentRow.planned_date,
    vehicleNumber: fulfilmentRow.vehicle_number,
    driverName: fulfilmentRow.driver_name,
    dispatchedAt: fulfilmentRow.dispatched_at,
    fulfilledAt: fulfilmentRow.fulfilled_at,
    notes: fulfilmentRow.notes,
    createdAt: fulfilmentRow.created_at,
    items: itemRecords,
    finalQaqc,
    totalQuantity: total,
    dispatchedQuantity: dispatched,
    canDispatch:
      ["ready", "partially_dispatched"].includes(fulfilmentRow.status) &&
      qaqcOk &&
      quantityGreaterThan(total, dispatched),
    customerPoId: poId,
    poNumber: po.po_number as string,
    customerName: po.customer_name as string,
    customerCode: (workspaceCustomer?.customer_code as string) ?? "",
    priority: po.priority as FulfilmentWorkspaceDetail["priority"],
    requiredDeliveryDate: (po.required_date as string | null) ?? null,
    poStatus: po.status as string,
    createdByName,
    traceability: traceability.sort((a, b) => a.batchNumber.localeCompare(b.batchNumber)),
  };
}

export async function getBatchFulfillmentUsage(batchId: string): Promise<BatchFulfillmentUsage> {
  if (getPersistenceMode() === "mock") return mockBatchFulfillmentUsage(batchId);

  const client = await getClient();
  const { data: stockData, error: stockError } = await client
    .from("inventory_items")
    .select("*")
    .eq("batch_id", batchId)
    .in("inventory_type", SELLABLE_TYPES);
  if (stockError) throw new Error("Unable to load batch inventory.");
  const stock = (stockData ?? []) as InventoryRow[];

  const { data: allocationData, error: allocationError } = await client
    .from("inventory_allocations")
    .select("*")
    .eq("batch_id", batchId);
  if (allocationError) throw new Error("Unable to load batch allocations.");
  const allocations = (allocationData ?? []) as AllocationRow[];

  const itemIds = [...new Set(allocations.map((row) => row.customer_purchase_order_item_id))];
  const fulfilmentIds = [...new Set(allocations.map((row) => row.fulfilment_id).filter((id): id is string => Boolean(id)))];
  const itemToPo = new Map<string, string>();
  const poInfo = new Map<string, { poNumber: string; customerName: string }>();
  const fulfilmentNumbers = new Map<string, string>();

  if (itemIds.length) {
    const { data } = await client
      .from("customer_purchase_order_items")
      .select("id, customer_purchase_order_id")
      .in("id", itemIds);
    for (const row of (data ?? []) as NestedRow[]) {
      itemToPo.set(row.id as string, row.customer_purchase_order_id as string);
    }
    const poIds = [...new Set(itemToPo.values())];
    if (poIds.length) {
      const { data: pos } = await client
        .from("customer_purchase_orders")
        .select("id, po_number, customer_name")
        .in("id", poIds);
      for (const row of (pos ?? []) as NestedRow[]) {
        poInfo.set(row.id as string, {
          poNumber: row.po_number as string,
          customerName: row.customer_name as string,
        });
      }
    }
  }
  if (fulfilmentIds.length) {
    const { data } = await client.from("fulfilments").select("id, fulfilment_number").in("id", fulfilmentIds);
    for (const row of (data ?? []) as NestedRow[]) {
      fulfilmentNumbers.set(row.id as string, row.fulfilment_number as string);
    }
  }

  const total = roundQuantity(stock.reduce((sum, row) => sum + num(row.quantity), 0));
  const reserved = roundQuantity(stock.reduce((sum, row) => sum + num(row.reserved_quantity), 0));

  return {
    batchId,
    unit: stock[0]?.unit ?? "kg",
    totalQuantity: total,
    reservedQuantity: reserved,
    availableQuantity: roundQuantity(total - reserved),
    dispatchedQuantity: roundQuantity(allocations.reduce((sum, row) => sum + num(row.fulfilled_quantity), 0)),
    inventoryItems: stock.map((row) => ({
      inventoryItemId: row.id,
      inventoryType: row.inventory_type,
      totalQuantity: num(row.quantity),
      reservedQuantity: num(row.reserved_quantity),
      availableQuantity: roundQuantity(num(row.quantity) - num(row.reserved_quantity)),
      unit: row.unit,
    })),
    allocations: allocations
      .map((row) => {
        const poId = itemToPo.get(row.customer_purchase_order_item_id) ?? "";
        const info = poInfo.get(poId);
        return {
          allocationId: row.id,
          customerPoId: poId,
          poNumber: info?.poNumber ?? "",
          customerName: info?.customerName ?? "Unknown customer",
          fulfilmentNumber: row.fulfilment_id ? (fulfilmentNumbers.get(row.fulfilment_id) ?? null) : null,
          allocatedQuantity: num(row.allocated_quantity),
          fulfilledQuantity: num(row.fulfilled_quantity),
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

export async function allocateInventory(
  input: AllocateInventoryInput,
): Promise<ServiceResult<{ allocationIds: string[]; customerPoStatus: string }>> {
  const normalized: AllocateInventoryInput = {
    ...input,
    lines: input.lines
      .map((line) => ({ ...line, quantity: roundQuantity(line.quantity) }))
      .filter((line) => line.quantity > 0),
  };
  const fieldErrors = validateAllocationInput(normalized);
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.lines ?? "Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockAllocateInventory(normalized, session.name);
      return ok({ allocationIds: result.allocationIds, customerPoStatus: result.customerPoStatus });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to allocate inventory.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("allocate_inventory_to_customer_po", {
    p_customer_po_item_id: normalized.customerPoItemId,
    p_lines: normalized.lines.map((line) => ({
      inventory_item_id: line.inventoryItemId,
      quantity: line.quantity,
    })),
    p_allocated_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    allocationIds: Array.isArray(payload.allocation_ids) ? (payload.allocation_ids as string[]) : [],
    customerPoStatus: String(payload.customer_po_status ?? ""),
  });
}

export async function releaseAllocation(
  allocationId: string,
  reason: string,
): Promise<ServiceResult<{ allocationId: string; customerPoStatus: string }>> {
  const fieldErrors = validateReason(reason, "A release reason");
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.reason, fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockReleaseAllocation(allocationId, reason, session.name);
      return ok({ allocationId: result.allocationId, customerPoStatus: result.customerPoStatus });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to release allocation.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("release_inventory_allocation", {
    p_allocation_id: allocationId,
    p_reason: reason.trim(),
    p_released_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({ allocationId, customerPoStatus: String(payload.customer_po_status ?? "") });
}

export async function createFulfilment(
  input: CreateFulfilmentInput,
): Promise<ServiceResult<{ fulfilmentId: string; fulfilmentNumber: string }>> {
  const fieldErrors = validateCreateFulfilmentInput(input);
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.allocationIds ?? "Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockCreateFulfilment(input, session.name);
      return ok({ fulfilmentId: result.fulfilmentId, fulfilmentNumber: result.fulfilmentNumber });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create fulfilment.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("create_fulfilment_from_allocations", {
    p_customer_po_id: input.customerPoId,
    p_allocation_ids: input.allocationIds,
    p_planned_date: input.plannedDate || null,
    p_notes: input.notes.trim(),
    p_created_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    fulfilmentId: String(payload.fulfilment_id ?? ""),
    fulfilmentNumber: String(payload.fulfilment_number ?? ""),
  });
}

export async function recordFinalQaqc(
  input: FinalQaqcInput,
): Promise<ServiceResult<{ finalQaqcId: string; fulfilmentStatus: string; dispatchAllowed: boolean }>> {
  const normalized: FinalQaqcInput = {
    ...input,
    quantityChecked: input.quantityChecked == null ? null : roundQuantity(input.quantityChecked),
  };
  const fieldErrors = validateFinalQaqcInput(normalized);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockRecordFinalQaqc(normalized, session.name);
      return ok({
        finalQaqcId: result.finalQaqcId,
        fulfilmentStatus: result.fulfilmentStatus,
        dispatchAllowed: result.dispatchAllowed,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to record final QAQC.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("record_final_qaqc", {
    p_fulfilment_id: normalized.fulfilmentId,
    p_inspection_date: normalized.inspectionDate,
    p_inspector_id: asProfileId(session.id),
    p_result: normalized.result,
    p_quantity_checked: normalized.quantityChecked,
    p_notes: normalized.notes.trim(),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    finalQaqcId: String(payload.final_qaqc_id ?? ""),
    fulfilmentStatus: String(payload.fulfilment_status ?? ""),
    dispatchAllowed: Boolean(payload.dispatch_allowed),
  });
}

export async function dispatchFulfilment(
  input: DispatchFulfilmentInput,
): Promise<ServiceResult<{ fulfilmentStatus: string; customerPoStatus: string; dispatchedQuantity: number }>> {
  const normalized: DispatchFulfilmentInput = {
    ...input,
    lines: input.lines
      .map((line) => ({ ...line, quantity: roundQuantity(line.quantity) }))
      .filter((line) => line.quantity > 0),
  };
  const fieldErrors = validateDispatchInput(normalized);
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.lines ?? "Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockDispatchFulfilment(normalized, session.name);
      return ok({
        fulfilmentStatus: result.fulfilmentStatus,
        customerPoStatus: result.customerPoStatus,
        dispatchedQuantity: result.dispatchedQuantity,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to dispatch fulfilment.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("dispatch_fulfilment", {
    p_fulfilment_id: normalized.fulfilmentId,
    p_dispatch_quantity_lines: normalized.lines.map((line) => ({
      fulfilment_item_id: line.fulfilmentItemId,
      quantity: line.quantity,
    })),
    p_vehicle_number: normalized.vehicleNumber.trim(),
    p_driver_name: normalized.driverName.trim(),
    p_notes: normalized.notes.trim(),
    p_dispatched_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    fulfilmentStatus: String(payload.fulfilment_status ?? ""),
    customerPoStatus: String(payload.customer_po_status ?? ""),
    dispatchedQuantity: num(payload.dispatched_quantity),
  });
}

export async function cancelPoReleasingAllocations(
  poId: string,
  reason: string,
): Promise<ServiceResult<{ customerPurchaseOrderId: string; releasedAllocations: number }>> {
  const fieldErrors = validateReason(reason, "A cancellation reason");
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.reason, fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockCancelPoReleasingAllocations(poId, reason, session.name);
      return ok({ customerPurchaseOrderId: result.customerPurchaseOrderId, releasedAllocations: result.releasedAllocations });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to cancel customer purchase order.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("cancel_customer_po_release_allocations", {
    p_customer_po_id: poId,
    p_reason: reason.trim(),
    p_cancelled_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({ customerPurchaseOrderId: poId, releasedAllocations: Number(payload.released_allocations ?? 0) });
}

export async function cancelFulfilment(
  fulfilmentId: string,
  reason: string,
): Promise<ServiceResult<{ fulfilmentId: string }>> {
  const fieldErrors = validateReason(reason, "A cancellation reason");
  if (Object.keys(fieldErrors).length) return fail(fieldErrors.reason, fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      mockCancelFulfilment(fulfilmentId, reason, session.name);
      return ok({ fulfilmentId });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to cancel fulfilment.");
    }
  }

  const client = await getClient(true);
  const { error } = await client.rpc("cancel_fulfilment", {
    p_fulfilment_id: fulfilmentId,
    p_reason: reason.trim(),
    p_cancelled_by: asProfileId(session.id),
    p_actor_name: session.name,
  });
  if (error) return fail(cleanRpcMessage(error.message));
  return ok({ fulfilmentId });
}
