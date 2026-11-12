#!/usr/bin/env node
/**
 * Step 9 operational fulfilment checks (mock path).
 * Complements verify:fulfillment (18 scenarios covering allocate→QAQC→dispatch inventory effects).
 * Run: npm run verify:fulfilment-ops
 */
import assert from "node:assert/strict";

const fulfillment = await import("../src/lib/mock/fulfillment-store.ts");
const procurement = await import("../src/lib/mock/procurement-store.ts");
const permissions = await import("../src/lib/permissions.ts");
const { ROLES } = await import("../src/types/auth.ts");

const actor = "Ops Verifier";
const PO = "cpo_seed_1001";
const ITEM = "cpoi_seed_1";
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}

function throwsWith(fn, pattern) {
  assert.throws(fn, (error) => pattern.test(error.message), `expected error matching ${pattern}`);
}

function stock(id) {
  return procurement.getMockInventoryContext().inventoryItems.find((row) => row.id === id);
}

check("16. permissions: warehouse_staff has dispatch but not fulfil or final QAQC", () => {
  const { PERMISSIONS, hasPermission } = permissions;
  assert.equal(hasPermission(ROLES.warehouseStaff, PERMISSIONS.customerOrdersDispatch), true);
  assert.equal(hasPermission(ROLES.warehouseStaff, PERMISSIONS.customerOrdersFulfill), false);
  assert.equal(hasPermission(ROLES.warehouseStaff, PERMISSIONS.customerOrdersQaqc), false);
});

check("16b. permissions: warehouse_manager has fulfil, QAQC and dispatch", () => {
  const { PERMISSIONS, hasPermission } = permissions;
  assert.equal(hasPermission(ROLES.warehouseManager, PERMISSIONS.customerOrdersFulfill), true);
  assert.equal(hasPermission(ROLES.warehouseManager, PERMISSIONS.customerOrdersQaqc), true);
  assert.equal(hasPermission(ROLES.warehouseManager, PERMISSIONS.customerOrdersDispatch), true);
});

check("16c. permissions: data_entry has neither fulfil, dispatch nor final QAQC", () => {
  const { PERMISSIONS, hasPermission } = permissions;
  assert.equal(hasPermission(ROLES.dataEntry, PERMISSIONS.customerOrdersFulfill), false);
  assert.equal(hasPermission(ROLES.dataEntry, PERMISSIONS.customerOrdersDispatch), false);
  assert.equal(hasPermission(ROLES.dataEntry, PERMISSIONS.customerOrdersQaqc), false);
});

check("1–2. allocation + fulfilment appear on operations board", () => {
  const beforeQty = stock("inv_proc_0012").quantity;
  const beforeReserved = stock("inv_proc_0012").reservedQuantity;

  const allocated = fulfillment.mockAllocateInventory(
    { customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0012", quantity: 100 }] },
    actor,
  );
  assert.equal(stock("inv_proc_0012").quantity, beforeQty);
  assert.equal(stock("inv_proc_0012").reservedQuantity, beforeReserved + 100);

  const boardReady = fulfillment.mockListOperationalFulfilments();
  assert.ok(boardReady.ready_for_fulfilment.some((row) => row.customerPoId === PO));

  const created = fulfillment.mockCreateFulfilment(
    { customerPoId: PO, allocationIds: allocated.allocationIds, plannedDate: "2026-11-15", notes: "" },
    actor,
  );
  assert.equal(stock("inv_proc_0012").quantity, beforeQty);

  const board = fulfillment.mockListOperationalFulfilments();
  const awaiting = board.awaiting_final_qaqc.find((row) => row.fulfilmentId === created.fulfilmentId);
  assert.ok(awaiting, "draft fulfilment should appear in awaiting_final_qaqc");
  assert.equal(awaiting.fulfilmentNumber, created.fulfilmentNumber);

  globalThis.__step9FulfilmentId = created.fulfilmentId;
  globalThis.__step9AllocationIds = allocated.allocationIds;
});

check("13. failed final QAQC blocks dispatch and does not consume inventory", () => {
  const fulfilmentId = globalThis.__step9FulfilmentId;
  const beforeQty = stock("inv_proc_0012").quantity;
  const beforeReserved = stock("inv_proc_0012").reservedQuantity;

  const failed = fulfillment.mockRecordFinalQaqc(
    {
      fulfilmentId,
      inspectionDate: "2026-11-13",
      result: "failed",
      quantityChecked: 100,
      notes: "Temperature out of range",
    },
    actor,
  );
  assert.equal(failed.dispatchAllowed, false);

  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  const row = detail.fulfilments.find((item) => item.id === fulfilmentId);
  assert.equal(row.canDispatch, false);
  assert.equal(row.finalQaqc.result, "failed");

  throwsWith(
    () =>
      fulfillment.mockDispatchFulfilment(
        {
          fulfilmentId,
          lines: [{ fulfilmentItemId: row.items[0].id, quantity: 10 }],
          vehicleNumber: "DXB-9",
          driverName: "Sam",
          notes: "",
        },
        actor,
      ),
    /cannot be dispatched|final QAQC|QAQC/i,
  );

  assert.equal(stock("inv_proc_0012").quantity, beforeQty);
  assert.equal(stock("inv_proc_0012").reservedQuantity, beforeReserved);

  const board = fulfillment.mockListOperationalFulfilments();
  assert.ok(board.blocked_qaqc.some((item) => item.fulfilmentId === fulfilmentId));
});

check("3–12. passed QAQC then dispatch updates inventory and board", () => {
  const fulfilmentId = globalThis.__step9FulfilmentId;
  const beforeQty = stock("inv_proc_0012").quantity;
  const beforeReserved = stock("inv_proc_0012").reservedQuantity;

  const passed = fulfillment.mockRecordFinalQaqc(
    {
      fulfilmentId,
      inspectionDate: "2026-11-13",
      result: "passed",
      quantityChecked: 100,
      notes: "Cleared",
    },
    actor,
  );
  assert.equal(passed.dispatchAllowed, true);

  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  const fulfilment = detail.fulfilments.find((item) => item.id === fulfilmentId);
  assert.equal(fulfilment.canDispatch, true);

  const boardReady = fulfillment.mockListOperationalFulfilments();
  assert.ok(boardReady.ready_to_dispatch.some((row) => row.fulfilmentId === fulfilmentId));

  const item = fulfilment.items[0];
  const result = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId,
      lines: [{ fulfilmentItemId: item.id, quantity: 40 }],
      vehicleNumber: "DXB-OPS-1",
      driverName: "Ops Driver",
      notes: "Partial trip",
    },
    actor,
  );
  assert.equal(result.fulfilmentStatus, "partially_dispatched");
  assert.equal(result.customerPoStatus, "partially_fulfilled");
  assert.equal(stock("inv_proc_0012").quantity, beforeQty - 40);
  assert.equal(stock("inv_proc_0012").reservedQuantity, beforeReserved - 40);

  const moves = procurement
    .getMockInventoryContext()
    .inventoryMovements.filter((row) => row.inventoryItemId === "inv_proc_0012" && row.movementType === "dispatch");
  assert.ok(moves.some((row) => row.quantity === -40));

  const audits = fulfillment.mockListFulfillmentAudits(PO);
  assert.ok(audits.some((row) => /dispatch|Dispatched/i.test(row.action)));

  const after = fulfillment.mockGetFulfillmentDetail(PO);
  const allocation = after.allocations.find((row) => globalThis.__step9AllocationIds.includes(row.id));
  assert.ok(allocation);
  assert.equal(allocation.fulfilledQuantity, 40);

  const refreshed = after.fulfilments.find((row) => row.id === fulfilmentId);
  assert.equal(refreshed.items[0].dispatchedQuantity, 40);
});

check("15. duplicate dispatch against completed quantity is rejected", () => {
  const fulfilmentId = globalThis.__step9FulfilmentId;
  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  const fulfilment = detail.fulfilments.find((item) => item.id === fulfilmentId);
  const remaining = fulfilment.items[0].remainingQuantity;
  assert.ok(remaining > 0);

  fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId,
      lines: [{ fulfilmentItemId: fulfilment.items[0].id, quantity: remaining }],
      vehicleNumber: "DXB-OPS-1",
      driverName: "Ops Driver",
      notes: "Remainder",
    },
    actor,
  );

  throwsWith(
    () =>
      fulfillment.mockDispatchFulfilment(
        {
          fulfilmentId,
          lines: [{ fulfilmentItemId: fulfilment.items[0].id, quantity: 1 }],
          vehicleNumber: "DXB-OPS-1",
          driverName: "Ops Driver",
          notes: "",
        },
        actor,
      ),
    /cannot be dispatched|remaining|exceeds/i,
  );
});

check("getFulfilmentWorkspace preserves parent batch identity", () => {
  const board = fulfillment.mockListOperationalFulfilments();
  const row =
    board.completed[0] ?? board.ready_to_dispatch[0] ?? board.awaiting_final_qaqc[0] ?? board.blocked_qaqc[0];
  assert.ok(row?.fulfilmentId);
  const workspace = fulfillment.mockGetFulfilmentWorkspace(row.fulfilmentId);
  assert.ok(workspace);
  assert.ok(workspace.items.length > 0);
  assert.match(workspace.items[0].batchNumber, /BATCH-/);
  assert.ok(workspace.traceability.length > 0);
  assert.equal(workspace.traceability[0].batchNumber, workspace.items[0].batchNumber);
});

let failed = 0;
for (const result of results) {
  if (result.ok) {
    console.log(`  ok   ${result.name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${result.name}\n       ${result.error.message}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} Step 9 ops scenarios passed`);
process.exit(failed ? 1 : 0);
