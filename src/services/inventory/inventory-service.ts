import "server-only";

import { asProfileId } from "@/lib/authz";
import {
  getInventoryOriginAt,
  getLifecycleState,
} from "@/lib/inventory-lifecycle";
import { getFreshUntil } from "@/lib/fresh-window";
import {
  mockFreezeEligibleInventory,
  mockGetBatchInventorySummary,
  mockGetInventoryItemDetail,
  mockGetInventorySummary,
  mockListInventory,
  mockListInventoryMovements,
} from "@/lib/mock/procurement-store";
import { mockAllocationLabelsByInventoryId } from "@/lib/mock/fulfillment-store";
import { formatQuantity } from "@/lib/procurement-labels";
import { roundQuantity } from "@/lib/quantity";
import { shouldUseSupabaseData } from "@/lib/data-source";
import { getSession } from "@/services/auth/get-session";
import { getDatabaseClient } from "@/services/db/client";
import type { Database, InventoryMovementType, InventoryType } from "@/types/database";
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

type InventoryRow = Database["public"]["Tables"]["inventory_items"]["Row"];
type MovementRow = Database["public"]["Tables"]["inventory_movements"]["Row"];
type BatchRow = Database["public"]["Tables"]["batches"]["Row"];

function num(value: unknown): number {
  return roundQuantity(Number(value ?? 0));
}

function mapSummaryFromRows(
  items: InventoryRow[],
  movements: MovementRow[],
): InventoryBalanceSummary {
  const sumFor = (pick: (item: InventoryRow) => number) =>
    num(items.reduce((total, item) => total + pick(item), 0));

  const byType = (type: InventoryType) =>
    num(items.filter((item) => item.inventory_type === type).reduce((sum, item) => sum + num(item.quantity), 0));

  const total = sumFor((item) => num(item.quantity));
  const reserved = sumFor((item) => num(item.reserved_quantity));

  return {
    totalQuantity: total,
    reservedQuantity: reserved,
    availableQuantity: num(total - reserved),
    allocatedQuantity: reserved,
    fulfilledQuantity: num(
      movements
        .filter((row) => row.movement_type === "dispatch")
        .reduce((sum, row) => sum + Math.abs(num(row.quantity)), 0),
    ),
    rawQuantity: byType("raw"),
    processedQuantity: byType("processed"),
    frozenQuantity: byType("frozen"),
    wastageQuantity: byType("wastage"),
    freshQuantity: num(
      items
        .filter(
          (item) =>
            getLifecycleState({
              inventoryType: item.inventory_type,
              quantity: num(item.quantity),
              frozenAt: item.frozen_at,
            }) === "fresh",
        )
        .reduce((sum, item) => sum + num(item.quantity), 0),
    ),
  };
}

type AllocationLabelRow = {
  inventory_item_id: string;
  allocated_quantity: number;
  fulfilled_quantity: number;
  unit: string;
  customer_purchase_order_items: {
    customer_purchase_orders: { po_number: string } | null;
  } | null;
};

function attachAllocationSummaries(
  items: InventoryListItem[],
  labels: Map<string, string>,
): InventoryListItem[] {
  return items.map((item) => ({
    ...item,
    allocationSummary: labels.get(item.id) ?? null,
  }));
}

async function loadAllocationSummaryMap(
  client: NonNullable<Awaited<ReturnType<typeof getDatabaseClient>>>["client"],
  itemIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!itemIds.length) return result;

  const { data, error } = await client
    .from("inventory_allocations")
    .select(
      "inventory_item_id, allocated_quantity, fulfilled_quantity, unit, status, customer_purchase_order_items(customer_purchase_orders(po_number))",
    )
    .eq("status", "active" as const)
    .in("inventory_item_id", itemIds);

  if (error) throw error;

  for (const row of (data ?? []) as AllocationLabelRow[]) {
    const open = num(row.allocated_quantity) - num(row.fulfilled_quantity);
    if (open <= 0) continue;
    const poNumber = row.customer_purchase_order_items?.customer_purchase_orders?.po_number ?? "PO";
    const label = `${poNumber} · ${formatQuantity(open, row.unit)}`;
    const existing = result.get(row.inventory_item_id);
    result.set(row.inventory_item_id, existing ? `${existing}, ${label}` : label);
  }

  return result;
}

function mapListItem(item: InventoryRow, batch: BatchRow): InventoryListItem {
  const originAt = getInventoryOriginAt({
    inventoryType: item.inventory_type,
    createdAt: item.created_at,
    batchReceivedAt: batch.received_at,
  });

  const quantity = num(item.quantity);
  const reserved = num(item.reserved_quantity);

  return {
    id: item.id,
    batchId: item.batch_id,
    batchNumber: batch.batch_number,
    processingRunId: item.processing_run_id,
    inventoryType: item.inventory_type,
    productSpecies: item.product_species,
    quantity,
    reservedQuantity: reserved,
    availableQuantity: num(quantity - reserved),
    unit: item.unit,
    status: item.status,
    lifecycle: getLifecycleState({
      inventoryType: item.inventory_type,
      quantity,
      frozenAt: item.frozen_at,
    }),
    originAt,
    freshUntil: getFreshUntil(originAt),
    frozenAt: item.frozen_at,
    createdAt: item.created_at,
  };
}

export async function getInventorySummary(): Promise<InventoryBalanceSummary> {
  if (!shouldUseSupabaseData()) return mockGetInventorySummary();

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  const [{ data: items, error: itemsError }, { data: movements, error: movementsError }] = await Promise.all([
    client.from("inventory_items").select("*"),
    client.from("inventory_movements").select("*").eq("movement_type", "dispatch"),
  ]);

  if (itemsError) throw itemsError;
  if (movementsError) throw movementsError;

  return mapSummaryFromRows(items ?? [], movements ?? []);
}

export async function listInventory(filters: InventoryListFilters = {}): Promise<InventoryListItem[]> {
  if (!shouldUseSupabaseData()) {
    const rows = mockListInventory(filters);
    return attachAllocationSummaries(rows, mockAllocationLabelsByInventoryId());
  }

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  const { data, error } = await client
    .from("inventory_items")
    .select("*, batches(id, batch_number, received_at)")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const search = filters.search?.trim().toLowerCase();
  const typeFilter = filters.inventoryType
    ? Array.isArray(filters.inventoryType)
      ? filters.inventoryType
      : [filters.inventoryType]
    : null;

  const mapped = (data ?? [])
    .map((row) => {
      const batch = row.batches as Pick<BatchRow, "id" | "batch_number" | "received_at"> | null;
      if (!batch) return null;
      const item = row as InventoryRow & { batches?: unknown };
      delete item.batches;
      return mapListItem(item, {
        id: batch.id,
        batch_number: batch.batch_number,
        received_at: batch.received_at,
      } as BatchRow);
    })
    .filter((item): item is InventoryListItem => {
      if (!item) return false;
      if (filters.batchId && item.batchId !== filters.batchId) return false;
      if (filters.status && item.status !== filters.status) return false;
      if (filters.lifecycle && item.lifecycle !== filters.lifecycle) return false;
      if (typeFilter && !typeFilter.includes(item.inventoryType)) return false;
      if (search) {
        const haystack = [item.id, item.batchNumber, item.productSpecies].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

  const labels = await loadAllocationSummaryMap(
    client,
    mapped.map((item) => item.id),
  );
  return attachAllocationSummaries(mapped, labels);
}

export async function listInventoryMovements(
  filters: InventoryMovementFilters = {},
): Promise<InventoryMovementListItem[]> {
  if (!shouldUseSupabaseData()) return mockListInventoryMovements(filters);

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  let query = client
    .from("inventory_movements")
    .select("*, inventory_items(id, product_species, batch_id, batches(batch_number))")
    .order("performed_at", { ascending: false });

  if (filters.inventoryItemId) query = query.eq("inventory_item_id", filters.inventoryItemId);
  if (filters.movementType) {
    query = query.eq("movement_type", filters.movementType as InventoryMovementType);
  }
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;

  const rows: InventoryMovementListItem[] = [];
  for (const row of data ?? []) {
    const nested = row.inventory_items as
      | (Pick<InventoryRow, "id" | "product_species" | "batch_id"> & {
          batches: Pick<BatchRow, "batch_number"> | null;
        })
      | null;
    if (filters.batchId && nested?.batch_id !== filters.batchId) continue;

    rows.push({
      id: row.id,
      inventoryItemId: row.inventory_item_id,
      batchNumber: nested?.batches?.batch_number ?? "—",
      productSpecies: nested?.product_species ?? "—",
      movementType: row.movement_type,
      quantity: num(row.quantity),
      unit: row.unit,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      previousQuantity: num(row.previous_quantity),
      newQuantity: num(row.new_quantity),
      performedAt: row.performed_at,
      notes: row.notes,
    });
  }

  return rows;
}

export async function getBatchInventorySummary(batchId: string): Promise<BatchInventorySummary | null> {
  if (!shouldUseSupabaseData()) return mockGetBatchInventorySummary(batchId);

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  const [{ data: batch, error: batchError }, { data: items, error: itemsError }] = await Promise.all([
    client.from("batches").select("*").eq("id", batchId).maybeSingle(),
    client.from("inventory_items").select("*").eq("batch_id", batchId),
  ]);

  if (batchError) throw batchError;
  if (itemsError) throw itemsError;
  if (!batch) return null;

  const mapped = (items ?? []).map((item) => mapListItem(item, batch));
  const { data: movements, error: movementsError } = await client
    .from("inventory_movements")
    .select("*")
    .in(
      "inventory_item_id",
      (items ?? []).map((item) => item.id),
    );

  if (movementsError) throw movementsError;

  return {
    batchId: batch.id,
    batchNumber: batch.batch_number,
    productSpecies: batch.product_species,
    receivedAt: batch.received_at,
    items: mapped,
    totals: mapSummaryFromRows(items ?? [], movements ?? []),
  };
}

export async function getInventoryItem(id: string): Promise<InventoryItemDetail | null> {
  if (!shouldUseSupabaseData()) return mockGetInventoryItemDetail(id);

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  const { data, error } = await client
    .from("inventory_items")
    .select("*, batches(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const batch = data.batches as BatchRow;
  const item = data as InventoryRow & { batches?: unknown };
  delete item.batches;
  const mapped = mapListItem(item, batch);
  const movements = await listInventoryMovements({ inventoryItemId: id });

  return { ...mapped, movements };
}

export async function freezeEligibleInventory(actorName: string, actorId?: string): Promise<FreezeResult> {
  if (!shouldUseSupabaseData()) return mockFreezeEligibleInventory(actorName);

  const client = (await getDatabaseClient({ preferAdmin: true }))?.client;
  if (!client) throw new Error("Supabase is not configured.");

  const session = getSession();
  const actor = asProfileId(actorId ?? session.id);
  if (!actor) throw new Error("Actor profile is required to freeze inventory.");
  const label = actorName.trim() || session.name;
  if (!label) throw new Error("Actor name is required to freeze inventory.");

  const { data, error } = await client.rpc("freeze_eligible_inventory", {
    p_actor: actor,
    p_now: new Date().toISOString(),
  });

  if (error) throw error;

  const payload = data as { frozen_count?: number; frozen_ids?: string[] } | null;
  return {
    frozenCount: Number(payload?.frozen_count ?? 0),
    frozenIds: Array.isArray(payload?.frozen_ids) ? payload.frozen_ids.map(String) : [],
  };
}
