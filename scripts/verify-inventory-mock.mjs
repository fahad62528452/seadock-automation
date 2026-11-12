#!/usr/bin/env node
/**
 * Step 8 mock inventory lifecycle checks.
 * Run: npm run verify:inventory
 */
import assert from "node:assert/strict";

const procurement = await import("../src/lib/mock/procurement-store.ts");
const fulfillment = await import("../src/lib/mock/fulfillment-store.ts");
const lifecycle = await import("../src/lib/inventory-lifecycle.ts");

const {
  mockFreezeEligibleInventory,
  mockGetBatchInventorySummary,
  mockGetInventorySummary,
  mockListInventory,
  mockListInventoryMovements,
} = procurement;

const FREEZE_NOW = "2026-11-13T12:00:00.000Z";
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

function item(id) {
  return procurement.getMockInventoryContext().inventoryItems.find((row) => row.id === id);
}

function movements(id, type) {
  return procurement
    .getMockInventoryContext()
    .inventoryMovements.filter((row) => row.inventoryItemId === id && row.movementType === type);
}

check("1. total inventory sums quantity across items", () => {
  const summary = mockGetInventorySummary();
  const listed = mockListInventory().reduce((sum, row) => sum + row.quantity, 0);
  assert.equal(summary.totalQuantity, listed);
});

check("2. reserved quantity matches inventory reserved_quantity", () => {
  const summary = mockGetInventorySummary();
  const reserved = procurement
    .getMockInventoryContext()
    .inventoryItems.reduce((sum, row) => sum + row.reservedQuantity, 0);
  assert.equal(summary.reservedQuantity, reserved);
  assert.equal(summary.allocatedQuantity, summary.reservedQuantity);
});

check("3. available = quantity - reserved", () => {
  const summary = mockGetInventorySummary();
  assert.equal(summary.availableQuantity, summary.totalQuantity - summary.reservedQuantity);
});

check("4–5. allocation + fulfilment seed inventory remains sellable", () => {
  assert.equal(item("inv_proc_0012").quantity, 300);
  assert.equal(item("inv_proc_0018").quantity, 250);
  const available = fulfillment.mockGetAvailableInventory("cpo_seed_1001");
  const ids = available.items[0].options.map((row) => row.inventoryItemId);
  assert.ok(ids.includes("inv_proc_0012"));
  assert.ok(ids.includes("inv_proc_0018"));
});

check("6. raw inventory lists lifecycle seed raw stock", () => {
  const rows = mockListInventory({ inventoryType: "raw" });
  assert.ok(rows.some((row) => row.id === "inv_raw_lifecycle" && row.quantity === 80));
});

check("7. processed inventory includes fulfilment and lifecycle fresh yield", () => {
  const rows = mockListInventory({ inventoryType: "processed" });
  assert.ok(rows.some((row) => row.id === "inv_proc_0012"));
  assert.ok(rows.some((row) => row.id === "inv_proc_lifecycle_fresh"));
});

check("8. wastage inventory is first-class", () => {
  const rows = mockListInventory({ inventoryType: "wastage" });
  assert.ok(rows.some((row) => row.id === "inv_wastage_lifecycle"));
  assert.equal(mockGetInventorySummary().wastageQuantity > 0, true);
});

check("9. fresh inventory is raw/processed with quantity > 0", () => {
  const fresh = mockListInventory({ lifecycle: "fresh" });
  assert.ok(fresh.every((row) => row.inventoryType === "raw" || row.inventoryType === "processed"));
  assert.equal(
    mockGetInventorySummary().freshQuantity,
    fresh.reduce((sum, row) => sum + row.quantity, 0),
  );
});

check("10. fresh cutoff uses origin timestamp helpers", () => {
  const raw = item("inv_raw_lifecycle");
  const batch = procurement.getMockInventoryContext().batches.find((row) => row.id === raw.batchId);
  const origin = lifecycle.getInventoryOriginAt({
    inventoryType: raw.inventoryType,
    createdAt: raw.createdAt,
    batchReceivedAt: batch.receivedAt,
  });
  assert.equal(origin, batch.receivedAt);
  assert.equal(lifecycle.isPastFreshCutoff(origin, new Date(FREEZE_NOW)), true);

  const recent = item("inv_proc_lifecycle_fresh");
  const recentOrigin = lifecycle.getInventoryOriginAt({
    inventoryType: recent.inventoryType,
    createdAt: recent.createdAt,
    batchReceivedAt: batch.receivedAt,
  });
  assert.equal(recentOrigin, recent.createdAt);
  assert.equal(lifecycle.isPastFreshCutoff(recentOrigin, new Date(FREEZE_NOW)), false);
});

check("11. frozen inventory lists already-frozen seed", () => {
  const frozen = mockListInventory({ lifecycle: "frozen" });
  assert.ok(frozen.some((row) => row.id === "inv_frozen_lifecycle"));
});

check("12–15. freeze transition protects reserved qty and is idempotent", () => {
  item("inv_raw_lifecycle").reservedQuantity = 25;
  const beforeQty = item("inv_raw_lifecycle").quantity;

  const first = mockFreezeEligibleInventory("Verifier", { now: FREEZE_NOW });
  assert.ok(first.frozenIds.includes("inv_raw_lifecycle"));
  assert.ok(first.frozenIds.includes("inv_proc_0012"));
  assert.ok(first.frozenIds.includes("inv_proc_0018"));
  assert.equal(item("inv_proc_lifecycle_fresh").inventoryType, "processed");
  assert.equal(item("inv_wastage_lifecycle").inventoryType, "wastage");
  assert.equal(item("inv_frozen_lifecycle").inventoryType, "frozen");

  assert.equal(item("inv_raw_lifecycle").quantity, beforeQty);
  assert.equal(item("inv_raw_lifecycle").reservedQuantity, 25);
  assert.equal(item("inv_raw_lifecycle").inventoryType, "frozen");
  assert.ok(item("inv_raw_lifecycle").frozenAt);

  const move = movements("inv_raw_lifecycle", "fresh_to_frozen")[0];
  assert.ok(move);
  assert.equal(move.quantity, 0);
  assert.equal(move.previousQuantity, move.newQuantity);
  assert.equal(move.newQuantity, beforeQty);

  const countBefore = movements("inv_raw_lifecycle", "fresh_to_frozen").length;
  const second = mockFreezeEligibleInventory("Verifier", { now: FREEZE_NOW });
  assert.equal(second.frozenCount, 0);
  assert.equal(movements("inv_raw_lifecycle", "fresh_to_frozen").length, countBefore);
});

check("16. batch inventory summary preserves parent batch identity", () => {
  const summary = mockGetBatchInventorySummary("batch_lifecycle_001");
  assert.ok(summary);
  assert.equal(summary.batchNumber, "BATCH-LIFE-001");
  assert.ok(summary.items.every((row) => row.batchNumber === "BATCH-LIFE-001"));
  assert.ok(summary.items.some((row) => row.id === "inv_raw_lifecycle" && row.inventoryType === "frozen"));
});

check("17. customer PO allocation + release preserve inventory identity", () => {
  const before = item("inv_proc_0012").reservedQuantity;
  const allocated = fulfillment.mockAllocateInventory(
    {
      customerPoItemId: "cpoi_seed_1",
      lines: [{ inventoryItemId: "inv_proc_0012", quantity: 40 }],
    },
    "Verifier",
  );
  assert.equal(item("inv_proc_0012").reservedQuantity, before + 40);

  const labels = fulfillment.mockAllocationLabelsByInventoryId();
  assert.match(labels.get("inv_proc_0012") ?? "", /PO-1001/);

  assert.ok(allocated.allocationIds?.length);
  fulfillment.mockReleaseAllocation(allocated.allocationIds[0], "Step 8 verify release", "Verifier");

  assert.equal(item("inv_proc_0012").reservedQuantity, before);
  assert.equal(item("inv_proc_0012").inventoryType, "frozen");
  assert.equal(item("inv_proc_0012").batchId, "batch_0012");
});

check("18. inventory movement history includes lifecycle and processing types", () => {
  const listed = mockListInventoryMovements({ limit: 200 });
  const types = new Set(listed.map((row) => row.movementType));
  assert.ok(types.has("fresh_to_frozen"));
  assert.ok(types.has("receipt") || types.has("processing_yield"));
});

check("19. freeze never drives quantity negative", () => {
  for (const row of procurement.getMockInventoryContext().inventoryItems) {
    assert.ok(row.quantity >= 0);
    assert.ok(row.reservedQuantity >= 0);
    assert.ok(row.reservedQuantity <= row.quantity);
  }
});

const failed = results.filter((row) => !row.ok);
for (const row of results) {
  console.log(row.ok ? `✓ ${row.name}` : `✗ ${row.name}`);
  if (!row.ok) console.error(row.error);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} inventory check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${results.length} inventory checks passed.`);
