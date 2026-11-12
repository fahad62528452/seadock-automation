#!/usr/bin/env node
/**
 * Scenario checks for the Step 7 mock fulfilment store.
 * Run: npm run verify:fulfillment
 *
 * Mirrors the business rules enforced by the SQL RPCs so the mock path and the
 * database path stay behaviourally aligned.
 */
import assert from "node:assert/strict";

const customerOrders = await import("../src/lib/mock/customer-order-store.ts");
const procurement = await import("../src/lib/mock/procurement-store.ts");
const fulfillment = await import("../src/lib/mock/fulfillment-store.ts");

const actor = "Verifier";
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

function movementsFor(id, type) {
  return procurement
    .getMockInventoryContext()
    .inventoryMovements.filter((row) => row.inventoryItemId === id && row.movementType === type);
}

const PO = "cpo_seed_1001";
const ITEM = "cpoi_seed_1";

check("seed: PO-1001 approved with 500 kg Frozen Fish Fillet", () => {
  const po = customerOrders.mockGetCustomerPurchaseOrder(PO);
  assert.equal(po.status, "approved");
  assert.equal(po.items.length, 1);
  assert.equal(po.items[0].productName, "Frozen Fish Fillet");
  assert.equal(po.items[0].quantity, 500);
});

check("seed: processed inventory 300 kg and 250 kg with stable ids", () => {
  assert.equal(stock("inv_proc_0012").quantity, 300);
  assert.equal(stock("inv_proc_0018").quantity, 250);
  const batches = procurement.getMockInventoryContext().batches;
  assert.equal(batches.find((row) => row.id === "batch_0012").batchNumber, "BATCH-2026-00012");
  assert.equal(batches.find((row) => row.id === "batch_0018").batchNumber, "BATCH-2026-00018");
});

check("availability lists both processed batches and hides wastage and raw", () => {
  const available = fulfillment.mockGetAvailableInventory(PO);
  const ids = available.items[0].options.map((row) => row.inventoryItemId);
  assert.deepEqual(ids.sort(), ["inv_proc_0012", "inv_proc_0018"]);
});

check("over-allocation beyond available stock is rejected and changes nothing", () => {
  throwsWith(
    () => fulfillment.mockAllocateInventory({ customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0012", quantity: 301 }] }, actor),
    /only 300 kg available/,
  );
  assert.equal(stock("inv_proc_0012").reservedQuantity, 0);
});

check("over-allocation beyond PO quantity is rejected", () => {
  throwsWith(
    () =>
      fulfillment.mockAllocateInventory(
        {
          customerPoItemId: ITEM,
          lines: [
            { inventoryItemId: "inv_proc_0012", quantity: 300 },
            { inventoryItemId: "inv_proc_0018", quantity: 250 },
          ],
        },
        actor,
      ),
    /exceeds the unallocated PO quantity of 500 kg/,
  );
  assert.equal(stock("inv_proc_0012").reservedQuantity, 0);
  assert.equal(stock("inv_proc_0018").reservedQuantity, 0);
});

check("wastage and raw inventory cannot be allocated", () => {
  throwsWith(
    () => fulfillment.mockAllocateInventory({ customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_waste_0012", quantity: 10 }] }, actor),
    /Wastage inventory cannot be allocated/,
  );
  throwsWith(
    () => fulfillment.mockAllocateInventory({ customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_raw_0012", quantity: 1 }] }, actor),
    /Only processed or frozen/,
  );
});

let allocationA;
check("partial allocation reserves stock without reducing quantity and marks PO partially_allocated", () => {
  const result = fulfillment.mockAllocateInventory(
    { customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0012", quantity: 200 }] },
    actor,
  );
  allocationA = result.allocationIds[0];
  assert.equal(result.customerPoStatus, "partially_allocated");
  assert.equal(stock("inv_proc_0012").quantity, 300);
  assert.equal(stock("inv_proc_0012").reservedQuantity, 200);
  const movement = movementsFor("inv_proc_0012", "reservation")[0];
  assert.equal(movement.previousQuantity, 300);
  assert.equal(movement.newQuantity, 300);
  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  assert.equal(detail.totals.allocatedQuantity, 200);
  assert.equal(detail.totals.fulfilledQuantity, 0);
  assert.equal(detail.totals.unallocatedQuantity, 300);
});

check("allocation does not mark the PO fulfilled", () => {
  assert.notEqual(customerOrders.mockGetCustomerPurchaseOrder(PO).status, "fulfilled");
});

let allocationB;
let allocationC;
check("multi-batch allocation completes the PO as ready_for_fulfillment", () => {
  const first = fulfillment.mockAllocateInventory(
    { customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0012", quantity: 100 }, { inventoryItemId: "inv_proc_0018", quantity: 200 }] },
    actor,
  );
  assert.equal(first.allocationIds.length, 2);
  [allocationB, allocationC] = first.allocationIds;
  assert.equal(first.customerPoStatus, "ready_for_fulfillment");
  assert.equal(stock("inv_proc_0012").reservedQuantity, 300);
  assert.equal(stock("inv_proc_0012").status, "reserved");
  assert.equal(stock("inv_proc_0018").reservedQuantity, 200);
  throwsWith(
    () => fulfillment.mockAllocateInventory({ customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0018", quantity: 1 }] }, actor),
    /exceeds the unallocated PO quantity of 0 kg/,
  );
});

check("release returns reservation, writes release movement, and recalculates status", () => {
  const released = fulfillment.mockReleaseAllocation(allocationC, "Customer reduced order", actor);
  assert.equal(released.customerPoStatus, "partially_allocated");
  assert.equal(stock("inv_proc_0018").reservedQuantity, 0);
  assert.equal(movementsFor("inv_proc_0018", "release").length, 1);
  throwsWith(() => fulfillment.mockReleaseAllocation(allocationC, "again", actor), /Only active allocations/);
  const again = fulfillment.mockAllocateInventory(
    { customerPoItemId: ITEM, lines: [{ inventoryItemId: "inv_proc_0018", quantity: 200 }] },
    actor,
  );
  allocationC = again.allocationIds[0];
  assert.equal(again.customerPoStatus, "ready_for_fulfillment");
});

let fulfilmentId;
let items;
check("fulfilment is created from allocations without consuming inventory", () => {
  const created = fulfillment.mockCreateFulfilment(
    { customerPoId: PO, allocationIds: [allocationA, allocationB, allocationC], plannedDate: "2026-11-14", notes: "" },
    actor,
  );
  fulfilmentId = created.fulfilmentId;
  assert.match(created.fulfilmentNumber, /^FUL-\d{4}-00001$/);
  assert.equal(created.status, "draft");
  assert.equal(stock("inv_proc_0012").quantity, 300);
  items = fulfillment.mockGetFulfillmentDetail(PO).fulfilments[0].items;
  assert.equal(items.length, 3);
  throwsWith(
    () => fulfillment.mockCreateFulfilment({ customerPoId: PO, allocationIds: [allocationA], plannedDate: "", notes: "" }, actor),
    /Only active, unattached allocations/,
  );
  throwsWith(
    () => fulfillment.mockReleaseAllocation(allocationA, "x", actor),
    /Cancel the fulfilment before releasing/,
  );
});

check("dispatch is blocked before final QAQC and after a failed QAQC", () => {
  const dispatch = () =>
    fulfillment.mockDispatchFulfilment(
      { fulfilmentId, lines: [{ fulfilmentItemId: items[0].id, quantity: 10 }], vehicleNumber: "DXB-1", driverName: "Ali", notes: "" },
      actor,
    );
  throwsWith(dispatch, /Final QAQC must be passed or conditional/);
  const failed = fulfillment.mockRecordFinalQaqc(
    { fulfilmentId, inspectionDate: "2026-11-13", result: "failed", quantityChecked: 500, notes: "Temperature excursion" },
    actor,
  );
  assert.equal(failed.dispatchAllowed, false);
  assert.equal(failed.fulfilmentStatus, "draft");
  throwsWith(dispatch, /Final QAQC must be passed or conditional/);
  assert.equal(stock("inv_proc_0012").quantity, 300);
});

check("conditional QAQC allows dispatch and keeps one QAQC row per fulfilment", () => {
  const passed = fulfillment.mockRecordFinalQaqc(
    { fulfilmentId, inspectionDate: "2026-11-13", result: "conditional", quantityChecked: 500, notes: "Re-glazed" },
    actor,
  );
  assert.equal(passed.dispatchAllowed, true);
  assert.equal(passed.fulfilmentStatus, "ready");
  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  assert.equal(detail.fulfilments[0].finalQaqc.result, "conditional");
  assert.equal(detail.fulfilments[0].canDispatch, true);
});

check("partial dispatch consumes stock and reservation together and keeps PO partially_fulfilled", () => {
  throwsWith(
    () =>
      fulfillment.mockDispatchFulfilment(
        { fulfilmentId, lines: [{ fulfilmentItemId: items[0].id, quantity: 9999 }], vehicleNumber: "DXB-1", driverName: "Ali", notes: "" },
        actor,
      ),
    /exceeds the remaining fulfilment quantity/,
  );
  throwsWith(
    () => fulfillment.mockDispatchFulfilment({ fulfilmentId, lines: [{ fulfilmentItemId: items[0].id, quantity: 10 }], vehicleNumber: "", driverName: "", notes: "" }, actor),
    /Vehicle number is required/,
  );

  const first = items.find((row) => row.allocationId === allocationA);
  const result = fulfillment.mockDispatchFulfilment(
    { fulfilmentId, lines: [{ fulfilmentItemId: first.id, quantity: 150 }], vehicleNumber: "DXB-1", driverName: "Ali", notes: "Trip 1" },
    actor,
  );
  assert.equal(result.fulfilmentStatus, "partially_dispatched");
  assert.equal(result.customerPoStatus, "partially_fulfilled");
  assert.equal(stock("inv_proc_0012").quantity, 150);
  assert.equal(stock("inv_proc_0012").reservedQuantity, 150);
  const dispatchMove = movementsFor("inv_proc_0012", "dispatch")[0];
  assert.equal(dispatchMove.quantity, -150);
  assert.equal(dispatchMove.previousQuantity, 300);
  assert.equal(dispatchMove.newQuantity, 150);

  const detail = fulfillment.mockGetFulfillmentDetail(PO);
  assert.equal(detail.totals.fulfilledQuantity, 150);
  assert.equal(detail.totals.remainingQuantity, 350);
  assert.equal(detail.totals.allocatedQuantity, 350);
  const allocation = detail.allocations.find((row) => row.id === allocationA);
  assert.equal(allocation.status, "active");
  assert.equal(allocation.reservedQuantity, 50);
  throwsWith(
    () => fulfillment.mockCancelPoReleasingAllocations(PO, "late cancel", actor),
    /dispatched quantity cannot be cancelled/,
  );
});

check("final dispatch fulfils the PO, completes the fulfilment, and zeroes sold-out stock", () => {
  const detail = fulfillment.mockGetFulfillmentDetail(PO).fulfilments[0];
  const lines = detail.items
    .filter((row) => row.remainingQuantity > 0)
    .map((row) => ({ fulfilmentItemId: row.id, quantity: row.remainingQuantity }));
  const result = fulfillment.mockDispatchFulfilment(
    { fulfilmentId, lines, vehicleNumber: "DXB-1", driverName: "Ali", notes: "Trip 2" },
    actor,
  );
  assert.equal(result.fulfilmentStatus, "fulfilled");
  assert.equal(result.customerPoStatus, "fulfilled");
  assert.equal(stock("inv_proc_0012").quantity, 0);
  assert.equal(stock("inv_proc_0012").reservedQuantity, 0);
  assert.equal(stock("inv_proc_0012").status, "dispatched");
  assert.equal(stock("inv_proc_0018").quantity, 50);
  assert.equal(stock("inv_proc_0018").reservedQuantity, 0);
  assert.equal(stock("inv_proc_0018").status, "available");
  const po = customerOrders.mockGetCustomerPurchaseOrder(PO);
  assert.equal(po.status, "fulfilled");
  assert.equal(po.items[0].fulfilledQuantity, 500);
  throwsWith(
    () => fulfillment.mockDispatchFulfilment({ fulfilmentId, lines: [{ fulfilmentItemId: detail.items[0].id, quantity: 1 }], vehicleNumber: "DXB-1", driverName: "Ali", notes: "" }, actor),
    /cannot be dispatched/,
  );
});

check("batch usage reports reserved, available, and dispatched quantities", () => {
  const usage = fulfillment.mockBatchFulfillmentUsage("batch_0018");
  assert.equal(usage.totalQuantity, 50);
  assert.equal(usage.dispatchedQuantity, 200);
  assert.equal(usage.availableQuantity, 50);
  assert.equal(usage.allocations[0].poNumber, "PO-1001");
});

check("cancelling a PO releases allocations, cancels fulfilments, and restores availability", () => {
  const created = customerOrders.mockCreateCustomerPurchaseOrder(
    {
      customerId: "cust_example_001",
      poNumber: "PO-CANCEL-1",
      poDate: "2026-11-12",
      receivedAt: "2026-11-12T10:00:00.000Z",
      requiredDeliveryDate: "2026-11-15",
      priority: "normal",
      notes: "",
      items: [
        { productName: "Frozen Fish Fillet", species: "Frozen Fish Fillet", productCode: "", quantity: 40, unit: "kg", requiredDeliveryDate: "", specifications: "", notes: "" },
      ],
    },
    actor,
  );
  throwsWith(
    () => fulfillment.mockAllocateInventory({ customerPoItemId: customerOrders.mockGetCustomerPurchaseOrder(created.customerPurchaseOrderId).items[0].id, lines: [{ inventoryItemId: "inv_proc_0018", quantity: 10 }] }, actor),
    /must be approved/,
  );
  customerOrders.mockChangeCustomerPoStatus(
    created.customerPurchaseOrderId,
    { toStatus: "approved", reason: "ok", notes: "" },
    actor,
  );
  const item = customerOrders.mockGetCustomerPurchaseOrder(created.customerPurchaseOrderId).items[0];
  const allocation = fulfillment.mockAllocateInventory(
    { customerPoItemId: item.id, lines: [{ inventoryItemId: "inv_proc_0018", quantity: 40 }] },
    actor,
  );
  assert.equal(allocation.customerPoStatus, "ready_for_fulfillment");
  assert.equal(stock("inv_proc_0018").reservedQuantity, 40);
  assert.equal(stock("inv_proc_0018").status, "available");

  fulfillment.mockCreateFulfilment(
    { customerPoId: created.customerPurchaseOrderId, allocationIds: allocation.allocationIds, plannedDate: "", notes: "" },
    actor,
  );
  throwsWith(
    () => fulfillment.mockCancelPoReleasingAllocations(created.customerPurchaseOrderId, "", actor),
    /cancellation reason is required/,
  );
  const cancelled = fulfillment.mockCancelPoReleasingAllocations(created.customerPurchaseOrderId, "Customer cancelled", actor);
  assert.equal(cancelled.releasedAllocations, 1);
  assert.equal(stock("inv_proc_0018").reservedQuantity, 0);
  const po = customerOrders.mockGetCustomerPurchaseOrder(created.customerPurchaseOrderId);
  assert.equal(po.status, "cancelled");
  const detail = fulfillment.mockGetFulfillmentDetail(created.customerPurchaseOrderId);
  assert.equal(detail.fulfilments[0].status, "cancelled");
  assert.equal(detail.allocations[0].status, "released");
  assert.equal(fulfillment.mockFulfillmentDashboardStats().awaitingFinalQaqc, 0);
});

check("cancelling a draft fulfilment detaches allocations so they can join a new one", () => {
  const created = customerOrders.mockCreateCustomerPurchaseOrder(
    {
      customerId: "cust_example_001",
      poNumber: "PO-CANCEL-2",
      poDate: "2026-11-12",
      receivedAt: "2026-11-12T10:00:00.000Z",
      requiredDeliveryDate: "",
      priority: "normal",
      notes: "",
      items: [
        { productName: "Frozen Fish Fillet", species: "Frozen Fish Fillet", productCode: "", quantity: 20, unit: "kg", requiredDeliveryDate: "", specifications: "", notes: "" },
      ],
    },
    actor,
  );
  customerOrders.mockChangeCustomerPoStatus(created.customerPurchaseOrderId, { toStatus: "approved", reason: "ok", notes: "" }, actor);
  const item = customerOrders.mockGetCustomerPurchaseOrder(created.customerPurchaseOrderId).items[0];
  const allocation = fulfillment.mockAllocateInventory({ customerPoItemId: item.id, lines: [{ inventoryItemId: "inv_proc_0018", quantity: 20 }] }, actor);
  const first = fulfillment.mockCreateFulfilment({ customerPoId: created.customerPurchaseOrderId, allocationIds: allocation.allocationIds, plannedDate: "", notes: "" }, actor);
  fulfillment.mockCancelFulfilment(first.fulfilmentId, "Wrong lot", actor);
  const second = fulfillment.mockCreateFulfilment({ customerPoId: created.customerPurchaseOrderId, allocationIds: allocation.allocationIds, plannedDate: "", notes: "" }, actor);
  assert.notEqual(first.fulfilmentId, second.fulfilmentId);
  assert.equal(stock("inv_proc_0018").reservedQuantity, 20);
  assert.equal(fulfillment.mockFulfillmentDashboardStats().awaitingFinalQaqc, 1);
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
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
process.exit(failed ? 1 : 0);
