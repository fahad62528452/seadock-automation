#!/usr/bin/env node
/**
 * Step 10 end-to-end mock verification (scenarios A–J).
 * Run: npm run verify:e2e
 *
 * Mirrors procurement → processing → customer PO → allocation → fulfilment → QAQC → dispatch.
 * Live Supabase is not configured; all checks run against in-memory mock stores.
 */
import assert from "node:assert/strict";

const procurement = await import("../src/lib/mock/procurement-store.ts");
const customerOrders = await import("../src/lib/mock/customer-order-store.ts");
const fulfillment = await import("../src/lib/mock/fulfillment-store.ts");
const permissions = await import("../src/lib/permissions.ts");
const { ROLES } = await import("../src/types/auth.ts");
const { PERMISSIONS } = permissions;

const actor = "E2E Verifier";
const PO_DATE = "2026-11-10";
const RECENT = "2026-11-12T08:00:00.000Z";
const OLD_RECEIVE = "2026-11-08T10:00:00.000Z";
const FREEZE_NOW = "2026-11-13T12:00:00.000Z";

const results = [];
const scenarioMap = new Map();

function check(scenario, name, fn) {
  const label = scenario ? `Scenario ${scenario}: ${name}` : name;
  try {
    fn();
    results.push({ scenario, name, label, ok: true });
    if (scenario) {
      const row = scenarioMap.get(scenario) ?? { checks: 0, failed: 0 };
      row.checks += 1;
      scenarioMap.set(scenario, row);
    }
  } catch (error) {
    results.push({ scenario, name, label, ok: false, error });
    if (scenario) {
      const row = scenarioMap.get(scenario) ?? { checks: 0, failed: 0 };
      row.checks += 1;
      row.failed += 1;
      scenarioMap.set(scenario, row);
    }
  }
}

function throwsWith(fn, pattern) {
  assert.throws(fn, (error) => pattern.test(error.message), `expected error matching ${pattern}`);
}

function ctx() {
  return procurement.getMockInventoryContext();
}

function stock(id) {
  return ctx().inventoryItems.find((row) => row.id === id);
}

function movements(id, type) {
  return ctx().inventoryMovements.filter((row) => row.inventoryItemId === id && row.movementType === type);
}

function itemsForBatch(batchId, inventoryType) {
  return ctx().inventoryItems.filter((row) => row.batchId === batchId && row.inventoryType === inventoryType);
}

function vendorInput(code, name) {
  return {
    vendorCode: code,
    vendorName: name,
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    status: "active",
    notes: "",
  };
}

function createVendorPo(vendorId, poNumber, species, qty) {
  return procurement.mockCreatePurchaseOrder(
    {
      poNumber,
      vendorId,
      poDate: PO_DATE,
      expectedDate: "2026-11-15",
      notes: "E2E",
      status: "issued",
      items: [{ productSpecies: species, orderedQuantity: qty, unit: "kg", notes: "" }],
    },
    actor,
  );
}

function receivePurchaseOrder(po, receiptNumber, receivedAt, qaqcResult = "passed") {
  const line = po.items[0];
  return procurement.mockCompleteReceiving(
    {
      purchaseOrderId: po.id,
      receiptNumber,
      receivedAt,
      driverName: "Driver E2E",
      vehicleNumber: "DXB-E2E",
      notes: "",
      items: [{ purchaseOrderItemId: line.id, receivedQuantity: line.orderedQuantity, unit: "kg", notes: "" }],
      qaqc: { inspectionDate: receivedAt.slice(0, 10), result: qaqcResult, notes: "" },
      allowOverReceive: false,
    },
    actor,
  );
}

function processBatch(batchId, inputQty, yieldQty, wastageQty, processingRunId) {
  return procurement.mockCompleteProcessing(
    {
      parentBatchId: batchId,
      processingDate: PO_DATE,
      operatorName: "Processor E2E",
      inputQuantity: inputQty,
      unit: "kg",
      yieldQuantity: yieldQty,
      wastageQuantity: wastageQty,
      notes: "",
      qaqc: { inspectionDate: PO_DATE, result: "passed", notes: "" },
      processingRunId,
    },
    actor,
  );
}

function createActiveCustomerPo(poNumber, species, qty) {
  const customer = customerOrders.mockCreateCustomer(
    {
      customerCode: `CUST-E2E-${poNumber}`,
      name: `E2E Customer ${poNumber}`,
      email: "",
      phone: "",
      address: "",
      contactPerson: "",
      status: "active",
      notes: "",
    },
    actor,
  );
  const created = customerOrders.mockCreateCustomerPurchaseOrder(
    {
      customerId: customer.id,
      poNumber,
      poDate: PO_DATE,
      receivedAt: RECENT,
      requiredDeliveryDate: "2026-11-20",
      priority: "normal",
      notes: "",
      items: [
        {
          productName: species,
          species,
          productCode: "",
          quantity: qty,
          unit: "kg",
          requiredDeliveryDate: "",
          specifications: "",
          notes: "",
        },
      ],
    },
    actor,
  );
  customerOrders.mockChangeCustomerPoStatus(
    created.customerPurchaseOrderId,
    { toStatus: "approved", reason: "E2E approve", notes: "" },
    actor,
  );
  const detail = customerOrders.mockGetCustomerPurchaseOrder(created.customerPurchaseOrderId);
  return {
    customerPoId: created.customerPurchaseOrderId,
    customerPoItemId: detail.items[0].id,
    poNumber,
  };
}

function approveAndAllocate(customerPoItemId, lines) {
  return fulfillment.mockAllocateInventory({ customerPoItemId, lines }, actor);
}

function createFulfilment(poId, allocationIds) {
  return fulfillment.mockCreateFulfilment(
    { customerPoId: poId, allocationIds, plannedDate: PO_DATE, notes: "" },
    actor,
  );
}

function passFinalQaqc(fulfilmentId, quantityChecked) {
  return fulfillment.mockRecordFinalQaqc(
    {
      fulfilmentId,
      inspectionDate: PO_DATE,
      result: "passed",
      quantityChecked,
      notes: "",
    },
    actor,
  );
}

/** Procurement + processing through to processed inventory for one PO line. */
function procureAndProcess(vendorId, poNumber, species, qty, receiptNumber, receivedAt, yieldQty, wastageQty) {
  const po = createVendorPo(vendorId, poNumber, species, qty);
  const recv = receivePurchaseOrder(po, receiptNumber, receivedAt);
  assert.equal(recv.accepted, true);
  const batchId = recv.batchIds[0];
  const batchBefore = procurement.mockGetBatch(batchId);
  const rawId = itemsForBatch(batchId, "raw")[0]?.id;
  assert.ok(rawId);
  const processed = processBatch(batchId, qty, yieldQty, wastageQty);
  return {
    batchId,
    batchNumber: batchBefore.batchNumber,
    rawId,
    processedId: itemsForBatch(batchId, "processed")[0]?.id,
    wastageId: itemsForBatch(batchId, "wastage")[0]?.id,
    processingRunId: processed.processingRunId,
    po,
  };
}

let scenarioAPoId = null;

// ---------------------------------------------------------------------------
// Scenario A — Normal fresh order (procurement → dispatch)
// ---------------------------------------------------------------------------

check("A", "vendor, PO, receiving, processing", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-A", "E2E Vendor A"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-A", "E2E Snapper", 100);
  assert.equal(po.status, "issued");
  const recv = receivePurchaseOrder(po, "GR-E2E-A-001", RECENT);
  assert.equal(recv.accepted, true);
  assert.equal(recv.batchIds.length, 1);
  const batchId = recv.batchIds[0];
  const raw = itemsForBatch(batchId, "raw")[0];
  assert.equal(raw.quantity, 100);
  assert.equal(movements(raw.id, "receipt").length, 1);
  const batchNumber = procurement.mockGetBatch(batchId).batchNumber;
  const processed = processBatch(batchId, 100, 35, 65);
  assert.equal(stock(raw.id).quantity, 0);
  const proc = itemsForBatch(batchId, "processed")[0];
  const waste = itemsForBatch(batchId, "wastage")[0];
  assert.equal(proc.quantity, 35);
  assert.equal(waste.quantity, 65);
  assert.equal(procurement.mockGetBatch(batchId).batchNumber, batchNumber);
  assert.ok(processed.accepted);
});

check("A", "customer PO, allocate, fulfil, QAQC, dispatch", () => {
  const { customerPoId, customerPoItemId } = createActiveCustomerPo("CPO-E2E-A", "E2E Snapper", 35);
  scenarioAPoId = customerPoId;
  const proc = ctx().inventoryItems.find(
    (row) => row.productSpecies === "E2E Snapper" && row.inventoryType === "processed" && row.quantity === 35,
  );
  assert.ok(proc);
  const alloc = approveAndAllocate(customerPoItemId, [{ inventoryItemId: proc.id, quantity: 35 }]);
  assert.equal(alloc.customerPoStatus, "ready_for_fulfillment");
  assert.equal(stock(proc.id).reservedQuantity, 35);
  const fulfil = createFulfilment(customerPoId, alloc.allocationIds);
  passFinalQaqc(fulfil.fulfilmentId, 35);
  const items = fulfillment.mockGetFulfillmentDetail(customerPoId).fulfilments[0].items;
  const dispatch = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId: fulfil.fulfilmentId,
      lines: items.map((row) => ({ fulfilmentItemId: row.id, quantity: row.quantity })),
      vehicleNumber: "DXB-A",
      driverName: "Ali",
      notes: "Full dispatch",
    },
    actor,
  );
  assert.equal(dispatch.fulfilmentStatus, "fulfilled");
  assert.equal(dispatch.customerPoStatus, "fulfilled");
  assert.equal(stock(proc.id).quantity, 0);
  assert.equal(stock(proc.id).reservedQuantity, 0);
  assert.equal(movements(proc.id, "dispatch").length, 1);
  const allocation = fulfillment.mockGetFulfillmentDetail(customerPoId).allocations[0];
  assert.equal(allocation.batchId, proc.batchId);
  assert.equal(customerOrders.mockGetCustomerPurchaseOrder(customerPoId).status, "fulfilled");
});

// ---------------------------------------------------------------------------
// Scenario B — Incoming QAQC failure
// ---------------------------------------------------------------------------

check("B", "failed incoming QAQC rejects receipt and inventory", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-B", "E2E Vendor B"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-B", "E2E Failed Receipt", 50);
  const beforeBatches = ctx().batches.length;
  const beforeItems = ctx().inventoryItems.length;
  const recv = receivePurchaseOrder(po, "GR-E2E-B-FAIL", RECENT, "failed");
  assert.equal(recv.accepted, false);
  assert.equal(recv.batchIds.length, 0);
  assert.equal(ctx().batches.length, beforeBatches);
  assert.equal(ctx().inventoryItems.length, beforeItems);
  const detail = procurement.mockGetGoodsReceipt(recv.goodsReceiptId);
  assert.equal(detail.status, "rejected");
  assert.equal(detail.qaqc?.result, "failed");
  assert.equal(detail.batches.length, 0);
});

// ---------------------------------------------------------------------------
// Scenario C — Processing reconciliation
// ---------------------------------------------------------------------------

check("C", "processing rejects when input ≠ yield + wastage", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-C", "E2E Vendor C"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-C", "E2E Reconcile", 100);
  const recv = receivePurchaseOrder(po, "GR-E2E-C-001", RECENT);
  const batchId = recv.batchIds[0];
  throwsWith(() => processBatch(batchId, 100, 50, 40), /must equal yield quantity plus wastage/);
  const ok = processBatch(batchId, 100, 35, 65);
  assert.equal(ok.accepted, true);
  assert.equal(itemsForBatch(batchId, "processed")[0].quantity, 35);
});

check("C", "decimal quantities reconcile", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-C2", "E2E Vendor C2"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-C-DEC", "E2E Decimal", 10.5);
  const recv = receivePurchaseOrder(po, "GR-E2E-C-DEC", RECENT);
  const batchId = recv.batchIds[0];
  throwsWith(() => processBatch(batchId, 10.5, 4, 6), /must equal yield quantity plus wastage/);
  processBatch(batchId, 10.5, 4.25, 6.25);
  assert.equal(itemsForBatch(batchId, "processed")[0].quantity, 4.25);
  assert.equal(itemsForBatch(batchId, "wastage")[0].quantity, 6.25);
});

// ---------------------------------------------------------------------------
// Scenario D — Multi-batch allocation
// ---------------------------------------------------------------------------

check("D", "two batches fulfil one customer PO", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-D", "E2E Vendor D"), actor);
  const first = procureAndProcess(vendor.id, "PO-E2E-D1", "E2E Multi", 100, "GR-E2E-D-001", RECENT, 60, 40);
  const second = procureAndProcess(vendor.id, "PO-E2E-D2", "E2E Multi", 100, "GR-E2E-D-002", RECENT, 40, 60);
  const { customerPoId, customerPoItemId } = createActiveCustomerPo("CPO-E2E-D", "E2E Multi", 100);
  const alloc = approveAndAllocate(customerPoItemId, [
    { inventoryItemId: first.processedId, quantity: 60 },
    { inventoryItemId: second.processedId, quantity: 40 },
  ]);
  assert.equal(alloc.allocationIds.length, 2);
  const fulfil = createFulfilment(customerPoId, alloc.allocationIds);
  passFinalQaqc(fulfil.fulfilmentId, 100);
  const items = fulfillment.mockGetFulfillmentDetail(customerPoId).fulfilments[0].items;
  const dispatch = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId: fulfil.fulfilmentId,
      lines: items.map((row) => ({ fulfilmentItemId: row.id, quantity: row.quantity })),
      vehicleNumber: "DXB-D",
      driverName: "Sam",
      notes: "",
    },
    actor,
  );
  assert.equal(dispatch.customerPoStatus, "fulfilled");
  assert.equal(stock(first.processedId).quantity, 0);
  assert.equal(stock(second.processedId).quantity, 0);
});

// ---------------------------------------------------------------------------
// Scenario E — Partial dispatch
// ---------------------------------------------------------------------------

check("E", "partial dispatch then completion", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-E", "E2E Vendor E"), actor);
  const lot = procureAndProcess(vendor.id, "PO-E2E-E", "E2E Partial", 100, "GR-E2E-E-001", RECENT, 100, 0);
  const { customerPoId, customerPoItemId } = createActiveCustomerPo("CPO-E2E-E", "E2E Partial", 100);
  const alloc = approveAndAllocate(customerPoItemId, [{ inventoryItemId: lot.processedId, quantity: 100 }]);
  const fulfil = createFulfilment(customerPoId, alloc.allocationIds);
  passFinalQaqc(fulfil.fulfilmentId, 100);
  let items = fulfillment.mockGetFulfillmentDetail(customerPoId).fulfilments[0].items;
  const trip1 = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId: fulfil.fulfilmentId,
      lines: [{ fulfilmentItemId: items[0].id, quantity: 40 }],
      vehicleNumber: "DXB-E1",
      driverName: "Pat",
      notes: "Trip 1",
    },
    actor,
  );
  assert.equal(trip1.fulfilmentStatus, "partially_dispatched");
  assert.equal(trip1.customerPoStatus, "partially_fulfilled");
  assert.equal(stock(lot.processedId).quantity, 60);
  assert.equal(stock(lot.processedId).reservedQuantity, 60);
  items = fulfillment.mockGetFulfillmentDetail(customerPoId).fulfilments[0].items;
  const trip2 = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId: fulfil.fulfilmentId,
      lines: [{ fulfilmentItemId: items[0].id, quantity: 60 }],
      vehicleNumber: "DXB-E2",
      driverName: "Pat",
      notes: "Trip 2",
    },
    actor,
  );
  assert.equal(trip2.fulfilmentStatus, "fulfilled");
  assert.equal(trip2.customerPoStatus, "fulfilled");
  assert.equal(stock(lot.processedId).quantity, 0);
  assert.equal(stock(lot.processedId).reservedQuantity, 0);
});

// ---------------------------------------------------------------------------
// Scenario F — Final QAQC failure then retry
// ---------------------------------------------------------------------------

check("F", "failed final QAQC blocks dispatch; pass allows dispatch", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-F", "E2E Vendor F"), actor);
  const lot = procureAndProcess(vendor.id, "PO-E2E-F", "E2E QAQC Fail", 80, "GR-E2E-F-001", RECENT, 80, 0);
  const { customerPoId, customerPoItemId } = createActiveCustomerPo("CPO-E2E-F", "E2E QAQC Fail", 80);
  const alloc = approveAndAllocate(customerPoItemId, [{ inventoryItemId: lot.processedId, quantity: 80 }]);
  const fulfil = createFulfilment(customerPoId, alloc.allocationIds);
  const beforeQty = stock(lot.processedId).quantity;
  const beforeReserved = stock(lot.processedId).reservedQuantity;
  fulfillment.mockRecordFinalQaqc(
    { fulfilmentId: fulfil.fulfilmentId, inspectionDate: PO_DATE, result: "failed", quantityChecked: 80, notes: "Temp" },
    actor,
  );
  const items = fulfillment.mockGetFulfillmentDetail(customerPoId).fulfilments[0].items;
  throwsWith(
    () =>
      fulfillment.mockDispatchFulfilment(
        {
          fulfilmentId: fulfil.fulfilmentId,
          lines: [{ fulfilmentItemId: items[0].id, quantity: 80 }],
          vehicleNumber: "DXB-F",
          driverName: "Lee",
          notes: "",
        },
        actor,
      ),
    /Final QAQC must be passed or conditional/,
  );
  assert.equal(stock(lot.processedId).quantity, beforeQty);
  assert.equal(stock(lot.processedId).reservedQuantity, beforeReserved);
  passFinalQaqc(fulfil.fulfilmentId, 80);
  const ok = fulfillment.mockDispatchFulfilment(
    {
      fulfilmentId: fulfil.fulfilmentId,
      lines: [{ fulfilmentItemId: items[0].id, quantity: 80 }],
      vehicleNumber: "DXB-F",
      driverName: "Lee",
      notes: "Retry",
    },
    actor,
  );
  assert.equal(ok.fulfilmentStatus, "fulfilled");
});

// ---------------------------------------------------------------------------
// Scenario G — Fresh → Frozen (dedicated old receipt; idempotent freeze)
// ---------------------------------------------------------------------------

check("G", "freeze old raw stock once; second freeze is idempotent", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-G", "E2E Vendor G"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-G", "E2E Freeze", 75);
  const recv = receivePurchaseOrder(po, "GR-E2E-G-OLD", OLD_RECEIVE);
  const batchId = recv.batchIds[0];
  const raw = itemsForBatch(batchId, "raw")[0];
  assert.ok(raw);
  const qtyBefore = raw.quantity;
  const reservedBefore = raw.reservedQuantity;
  assert.equal(raw.inventoryType, "raw");
  const first = procurement.mockFreezeEligibleInventory(actor, { now: FREEZE_NOW });
  assert.ok(first.frozenIds.includes(raw.id));
  assert.equal(stock(raw.id).inventoryType, "frozen");
  assert.equal(stock(raw.id).quantity, qtyBefore);
  assert.equal(stock(raw.id).reservedQuantity, reservedBefore);
  assert.equal(movements(raw.id, "fresh_to_frozen").length, 1);
  const countBefore = movements(raw.id, "fresh_to_frozen").length;
  const second = procurement.mockFreezeEligibleInventory(actor, { now: FREEZE_NOW });
  assert.equal(second.frozenCount, 0);
  assert.equal(movements(raw.id, "fresh_to_frozen").length, countBefore);
});

// ---------------------------------------------------------------------------
// Scenario H — Customer PO cancellation releases allocation
// ---------------------------------------------------------------------------

check("H", "cancel releases reserved stock", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-H", "E2E Vendor H"), actor);
  const lot = procureAndProcess(vendor.id, "PO-E2E-H", "E2E Cancel", 50, "GR-E2E-H-001", RECENT, 50, 0);
  const { customerPoId, customerPoItemId } = createActiveCustomerPo("CPO-E2E-H", "E2E Cancel", 30);
  const alloc = approveAndAllocate(customerPoItemId, [{ inventoryItemId: lot.processedId, quantity: 30 }]);
  assert.equal(stock(lot.processedId).reservedQuantity, 30);
  const qtyBefore = stock(lot.processedId).quantity;
  fulfillment.mockCancelPoReleasingAllocations(customerPoId, "Customer cancelled", actor);
  assert.equal(stock(lot.processedId).reservedQuantity, 0);
  assert.equal(stock(lot.processedId).quantity, qtyBefore);
  assert.equal(customerOrders.mockGetCustomerPurchaseOrder(customerPoId).status, "cancelled");
  const detail = fulfillment.mockGetFulfillmentDetail(customerPoId);
  assert.equal(detail.allocations.find((row) => alloc.allocationIds.includes(row.id)).status, "released");
});

// ---------------------------------------------------------------------------
// Scenario I — Permission matrix (app layer; hasPermission)
// ---------------------------------------------------------------------------

check("I", "role permission matrix matches ROLE_PERMISSIONS", () => {
  const { hasPermission } = permissions;
  const P = PERMISSIONS;
  assert.equal(hasPermission(ROLES.dataEntry, P.purchasesManage), true);
  assert.equal(hasPermission(ROLES.dataEntry, P.customerOrdersAllocate), false);
  assert.equal(hasPermission(ROLES.dataEntry, P.customerOrdersDispatch), false);
  assert.equal(hasPermission(ROLES.dataEntry, P.inventoryManage), false);

  assert.equal(hasPermission(ROLES.warehouseStaff, P.customerOrdersDispatch), true);
  assert.equal(hasPermission(ROLES.warehouseStaff, P.customerOrdersFulfill), false);
  assert.equal(hasPermission(ROLES.warehouseStaff, P.customerOrdersQaqc), false);
  assert.equal(hasPermission(ROLES.warehouseStaff, P.inventoryManage), true);

  assert.equal(hasPermission(ROLES.warehouseManager, P.customerOrdersAllocate), true);
  assert.equal(hasPermission(ROLES.warehouseManager, P.customerOrdersFulfill), true);
  assert.equal(hasPermission(ROLES.warehouseManager, P.customerOrdersQaqc), true);
  assert.equal(hasPermission(ROLES.warehouseManager, P.customerOrdersDispatch), true);

  assert.equal(hasPermission(ROLES.manager, P.auditView), true);
  assert.equal(hasPermission(ROLES.manager, P.processingComplete), true);
  assert.equal(hasPermission(ROLES.superAdmin, P.usersManage), true);
  assert.equal(hasPermission(ROLES.manager, P.usersManage), false);
});

// ---------------------------------------------------------------------------
// Scenario J — Fulfillment audit completeness (scenario A PO)
// ---------------------------------------------------------------------------

check("J", "fulfilment audits include allocate → dispatch chain", () => {
  assert.ok(scenarioAPoId, "scenario A must run first");
  const audits = fulfillment.mockListFulfillmentAudits(scenarioAPoId);
  const actions = new Set(audits.map((row) => row.action));
  assert.ok(actions.has("Inventory Allocated"), "missing Inventory Allocated");
  assert.ok(actions.has("Fulfilment Created"), "missing Fulfilment Created");
  assert.ok(actions.has("Final QAQC Recorded"), "missing Final QAQC Recorded");
  assert.ok(
    actions.has("Fulfilment Dispatched") || actions.has("Inventory Dispatched"),
    "missing dispatch audit",
  );
  for (const row of audits) {
    assert.ok(row.actorName, `audit ${row.id} missing actorName`);
    assert.ok(row.entityType, `audit ${row.id} missing entityType`);
    assert.ok(row.entityId, `audit ${row.id} missing entityId`);
    assert.ok(row.timestamp, `audit ${row.id} missing timestamp`);
  }
});

// ---------------------------------------------------------------------------
// Duplicate / idempotency
// ---------------------------------------------------------------------------

check(null, "duplicate receipt number is rejected", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-DUP", "E2E Dup"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-DUP", "E2E Dup", 10);
  receivePurchaseOrder(po, "GR-E2E-DUP-001", RECENT);
  throwsWith(
    () => receivePurchaseOrder(po, "GR-E2E-DUP-001", RECENT),
    /goods receipt with this number already exists/,
  );
});

check(null, "completing the same processing run twice is rejected", () => {
  const vendor = procurement.mockCreateVendor(vendorInput("V-E2E-DUP2", "E2E Dup2"), actor);
  const po = createVendorPo(vendor.id, "PO-E2E-DUP2", "E2E Dup Run", 20);
  const recv = receivePurchaseOrder(po, "GR-E2E-DUP2", RECENT);
  const batchId = recv.batchIds[0];
  const draft = procurement.mockCreateProcessingDraft(
    {
      parentBatchId: batchId,
      processingDate: PO_DATE,
      operatorName: "Op",
      inputQuantity: 20,
      unit: "kg",
      yieldQuantity: 0,
      wastageQuantity: 0,
      notes: "",
      qaqc: { inspectionDate: PO_DATE, result: "passed", notes: "" },
    },
    actor,
  );
  processBatch(batchId, 20, 15, 5, draft.processingRunId);
  const runDetail = procurement.mockGetProcessingRun(draft.processingRunId);
  assert.equal(runDetail.status, "completed");
  throwsWith(
    () => processBatch(batchId, 20, 15, 5, draft.processingRunId),
    /already completed|cannot exceed available batch inventory/,
  );
});

check(null, "dispatch after fully dispatched is rejected", () => {
  assert.ok(scenarioAPoId);
  const detail = fulfillment.mockGetFulfillmentDetail(scenarioAPoId);
  const fulfilmentId = detail.fulfilments[0].id;
  const itemId = detail.fulfilments[0].items[0].id;
  throwsWith(
    () =>
      fulfillment.mockDispatchFulfilment(
        { fulfilmentId, lines: [{ fulfilmentItemId: itemId, quantity: 1 }], vehicleNumber: "X", driverName: "Y", notes: "" },
        actor,
      ),
    /cannot be dispatched/,
  );
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

let failed = 0;
for (const row of results) {
  if (row.ok) {
    console.log(`  ok   ${row.label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${row.label}\n       ${row.error.message}`);
  }
}

const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
console.log("\nScenario summary:");
console.log("| Scenario | Result |");
console.log("| --- | --- |");
for (const letter of letters) {
  const stats = scenarioMap.get(letter);
  const ok = stats && stats.failed === 0;
  console.log(`| ${letter} | ${ok ? "PASS" : stats ? "FAIL" : "—"} |`);
}

console.log(
  "\nNote: Live concurrent warehouse sessions are not exercised in this script; " +
    "the mock path validates sequential lock semantics (e.g. over-allocation rejection).",
);
console.log(
  "Permissions in scenario I are checked via hasPermission (src/lib/permissions.ts) — app-layer only; RPC enforcement uses Supabase roles when configured.",
);

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
