import "server-only";

import { asProfileId } from "@/lib/authz";
import { getPersistenceMode, getDatabaseClient } from "@/services/db/client";
import { getFreshUntil, getFreshWindowStatus } from "@/lib/fresh-window";
import {
  mockCompleteReceiving,
  mockCreatePurchaseOrder,
  mockCreateVendor,
  mockGetBatch,
  mockGetGoodsReceipt,
  mockGetPurchaseOrder,
  mockGetVendor,
  mockListBatches,
  mockListGoodsReceipts,
  mockListOpenPurchaseOrders,
  mockListPurchaseOrders,
  mockListVendors,
  mockUpdateVendor,
} from "@/lib/mock/procurement-store";
import {
  normalizeText,
  validatePurchaseOrderInput,
  validateReceivingInput,
  validateVendorInput,
} from "@/lib/procurement-validation";
import { getSession } from "@/services/auth/get-session";
import { recordAuditEntry } from "@/services/audit/audit-service";
import type {
  BatchDetail,
  BatchListItem,
  CompleteReceivingInput,
  GoodsReceiptDetail,
  GoodsReceiptListItem,
  PurchaseOrderDetail,
  PurchaseOrderInput,
  PurchaseOrderListItem,
  ServiceResult,
  VendorInput,
  VendorRecord,
} from "@/types/procurement";
import type { Database } from "@/types/database";

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail<T = never>(error: string, fieldErrors?: Record<string, string>): ServiceResult<T> {
  return { ok: false, error, fieldErrors };
}

/** Nested Supabase select payloads are loosely shaped; cast at the query boundary. */
type NestedRow = {
  [key: string]: unknown;
};

function mapVendor(row: Database["public"]["Tables"]["vendors"]["Row"]): VendorRecord {
  return {
    id: row.id,
    vendorCode: row.vendor_code,
    vendorName: row.vendor_name,
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    address: row.address,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

export async function listVendors(): Promise<VendorRecord[]> {
  if (getPersistenceMode() === "mock") return mockListVendors();
  const client = await getClient();
  const { data, error } = await client.from("vendors").select("*").order("vendor_code");
  if (error) throw new Error("Unable to load vendors.");
  return (data ?? []).map(mapVendor);
}

export async function getVendor(id: string): Promise<VendorRecord | null> {
  if (getPersistenceMode() === "mock") return mockGetVendor(id);
  const client = await getClient();
  const { data, error } = await client.from("vendors").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load vendor.");
  return data ? mapVendor(data) : null;
}

export async function createVendor(input: VendorInput): Promise<ServiceResult<VendorRecord>> {
  const fieldErrors = validateVendorInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockCreateVendor(input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create vendor.");
    }
  }

  const client = await getClient();
  const { data, error } = await client
    .from("vendors")
    .insert({
      vendor_code: normalizeText(input.vendorCode),
      vendor_name: normalizeText(input.vendorName),
      contact_person: normalizeText(input.contactPerson) || null,
      phone: normalizeText(input.phone) || null,
      email: normalizeText(input.email) || null,
      address: normalizeText(input.address) || null,
      status: input.status,
      notes: normalizeText(input.notes) || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return fail("A vendor with this code already exists.", { vendorCode: "Vendor code must be unique." });
    return fail("Unable to create vendor.");
  }

  const vendor = mapVendor(data);
  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Vendor Created",
    recordType: "vendor",
    recordId: vendor.id,
    recordLabel: vendor.vendorCode,
    field: "vendor_code",
    previousValue: null,
    newValue: vendor.vendorCode,
  });

  return ok(vendor);
}

export async function updateVendor(id: string, input: VendorInput): Promise<ServiceResult<VendorRecord>> {
  const fieldErrors = validateVendorInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockUpdateVendor(id, input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to update vendor.");
    }
  }

  const existing = await getVendor(id);
  if (!existing) return fail("Vendor not found.");

  const client = await getClient();
  const { data, error } = await client
    .from("vendors")
    .update({
      vendor_code: normalizeText(input.vendorCode),
      vendor_name: normalizeText(input.vendorName),
      contact_person: normalizeText(input.contactPerson) || null,
      phone: normalizeText(input.phone) || null,
      email: normalizeText(input.email) || null,
      address: normalizeText(input.address) || null,
      status: input.status,
      notes: normalizeText(input.notes) || null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return fail("A vendor with this code already exists.", { vendorCode: "Vendor code must be unique." });
    return fail("Unable to update vendor.");
  }

  const vendor = mapVendor(data);
  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Vendor Updated",
    recordType: "vendor",
    recordId: vendor.id,
    recordLabel: vendor.vendorCode,
    field: "vendor_name",
    previousValue: existing.vendorName,
    newValue: vendor.vendorName,
  });

  return ok(vendor);
}

export async function listPurchaseOrders(): Promise<PurchaseOrderListItem[]> {
  if (getPersistenceMode() === "mock") return mockListPurchaseOrders();

  const client = await getClient();
  const { data, error } = await client
    .from("purchase_orders")
    .select("id, po_number, vendor_id, po_date, expected_date, status, created_at, vendors(vendor_name), purchase_order_items(id)")
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load purchase orders.");

  return ((data ?? []) as NestedRow[]).map((row) => {
    const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
    const items = Array.isArray(row.purchase_order_items) ? row.purchase_order_items : [];
    return {
      id: row.id as string,
      poNumber: row.po_number as string,
      vendorId: row.vendor_id as string,
      vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
      poDate: row.po_date as string,
      expectedDate: (row.expected_date as string | null) ?? null,
      itemCount: items.length,
      status: row.status as PurchaseOrderListItem["status"],
      createdByName: null,
      createdAt: row.created_at as string,
    };
  });
}

export async function listOpenPurchaseOrders(): Promise<PurchaseOrderDetail[]> {
  if (getPersistenceMode() === "mock") return mockListOpenPurchaseOrders();
  const orders = await listPurchaseOrders();
  const open = orders.filter((po) =>
    ["issued", "partially_received", "confirmed", "awaiting_verification"].includes(po.status),
  );
  const details = await Promise.all(open.map((po) => getPurchaseOrder(po.id)));
  return details.filter((po): po is PurchaseOrderDetail => Boolean(po));
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetPurchaseOrder(id);

  const client = await getClient();
  const { data: po, error } = await client
    .from("purchase_orders")
    .select("*, vendors(vendor_name, vendor_code), purchase_order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load purchase order.");
  if (!po) return null;

  const row = po as NestedRow;
  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  const itemsRaw = (Array.isArray(row.purchase_order_items) ? row.purchase_order_items : []) as NestedRow[];

  const items = await Promise.all(
    itemsRaw.map(async (item) => {
      const { data: received } = await client.rpc("po_item_received_quantity", {
        p_item_id: item.id as string,
      });
      const receivedQuantity = Number(received ?? 0);
      return {
        id: item.id as string,
        purchaseOrderId: item.purchase_order_id as string,
        productSpecies: item.product_species as string,
        orderedQuantity: Number(item.ordered_quantity),
        unit: item.unit as string,
        notes: (item.notes as string | null) ?? null,
        receivedQuantity,
        remainingQuantity: Math.max(Number(item.ordered_quantity) - receivedQuantity, 0),
      };
    }),
  );

  return {
    id: row.id as string,
    poNumber: row.po_number as string,
    vendorId: row.vendor_id as string,
    vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
    vendorCode: (vendor?.vendor_code as string | undefined) ?? "",
    poDate: row.po_date as string,
    expectedDate: (row.expected_date as string | null) ?? null,
    status: row.status as PurchaseOrderDetail["status"],
    notes: (row.notes as string | null) ?? null,
    createdByName: null,
    createdAt: row.created_at as string,
    items,
  };
}

export async function createPurchaseOrder(input: PurchaseOrderInput): Promise<ServiceResult<PurchaseOrderDetail>> {
  const fieldErrors = validatePurchaseOrderInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockCreatePurchaseOrder(input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create purchase order.");
    }
  }

  const client = await getClient();
  const status = input.status ?? "issued";
  const { data: po, error } = await client
    .from("purchase_orders")
    .insert({
      po_number: normalizeText(input.poNumber),
      vendor_id: input.vendorId,
      po_date: input.poDate,
      expected_date: normalizeText(input.expectedDate) || null,
      notes: normalizeText(input.notes) || null,
      status,
      created_by: asProfileId(session.id),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") return fail("A purchase order with this number already exists.", { poNumber: "PO number must be unique." });
    return fail("Unable to create purchase order.");
  }

  const { error: itemsError } = await client.from("purchase_order_items").insert(
    input.items.map((item) => ({
      purchase_order_id: po.id,
      product_species: normalizeText(item.productSpecies),
      ordered_quantity: item.orderedQuantity,
      unit: normalizeText(item.unit) || "kg",
      notes: normalizeText(item.notes) || null,
    })),
  );

  if (itemsError) {
    await client.from("purchase_orders").delete().eq("id", po.id);
    return fail("Unable to save purchase order items.");
  }

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "PO Created",
    recordType: "purchase_order",
    recordId: po.id,
    recordLabel: po.po_number,
    field: "status",
    previousValue: null,
    newValue: po.status,
  });

  const detail = await getPurchaseOrder(po.id);
  if (!detail) return fail("Purchase order was created but could not be loaded.");
  return ok(detail);
}

export async function listGoodsReceipts(): Promise<GoodsReceiptListItem[]> {
  if (getPersistenceMode() === "mock") return mockListGoodsReceipts();

  const client = await getClient();
  const { data, error } = await client
    .from("goods_receipts")
    .select("id, receipt_number, purchase_order_id, received_at, driver_name, vehicle_number, status, purchase_orders(po_number, vendors(vendor_name))")
    .order("received_at", { ascending: false });

  if (error) throw new Error("Unable to load goods receipts.");

  return ((data ?? []) as NestedRow[]).map((row) => {
    const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
    const vendor = po && (Array.isArray(po.vendors) ? po.vendors[0] : po.vendors);
    return {
      id: row.id as string,
      receiptNumber: row.receipt_number as string,
      purchaseOrderId: row.purchase_order_id as string,
      poNumber: (po?.po_number as string | undefined) ?? "Unknown PO",
      vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
      receivedAt: row.received_at as string,
      driverName: (row.driver_name as string | null) ?? null,
      vehicleNumber: (row.vehicle_number as string | null) ?? null,
      status: row.status as string,
    };
  });
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceiptDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetGoodsReceipt(id);

  const client = await getClient();
  const { data: receipt, error } = await client
    .from("goods_receipts")
    .select(
      "*, purchase_orders(po_number, vendors(vendor_name)), goods_receipt_items(*, purchase_order_items(product_species)), incoming_qaqc(*), batches(id, batch_number, product_species, received_quantity, unit)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load goods receipt.");
  if (!receipt) return null;

  const row = receipt as NestedRow;
  const po = Array.isArray(row.purchase_orders) ? row.purchase_orders[0] : row.purchase_orders;
  const vendor = po && (Array.isArray(po.vendors) ? po.vendors[0] : po.vendors);
  const qaqcRaw = Array.isArray(row.incoming_qaqc) ? row.incoming_qaqc[0] : row.incoming_qaqc;
  const items = ((Array.isArray(row.goods_receipt_items) ? row.goods_receipt_items : []) as NestedRow[]).map((item) => {
    const poItem = Array.isArray(item.purchase_order_items) ? item.purchase_order_items[0] : item.purchase_order_items;
    return {
      id: item.id as string,
      productSpecies: (poItem?.product_species as string | undefined) ?? "Unknown",
      receivedQuantity: Number(item.received_quantity),
      unit: item.unit as string,
      notes: (item.notes as string | null) ?? null,
    };
  });
  const batches = ((Array.isArray(row.batches) ? row.batches : []) as NestedRow[]).map((batch) => ({
    id: batch.id as string,
    batchNumber: batch.batch_number as string,
    productSpecies: batch.product_species as string,
    receivedQuantity: Number(batch.received_quantity),
    unit: batch.unit as string,
  }));

  return {
    id: row.id as string,
    receiptNumber: row.receipt_number as string,
    purchaseOrderId: row.purchase_order_id as string,
    poNumber: (po?.po_number as string | undefined) ?? "Unknown PO",
    vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
    receivedAt: row.received_at as string,
    driverName: (row.driver_name as string | null) ?? null,
    vehicleNumber: (row.vehicle_number as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    status: row.status as string,
    items,
    qaqc: qaqcRaw
      ? {
          id: qaqcRaw.id as string,
          inspectionDate: qaqcRaw.inspection_date as string,
          result: (qaqcRaw.result as string | null) ?? null,
          notes: (qaqcRaw.notes as string | null) ?? null,
          status: qaqcRaw.status as string,
        }
      : null,
    batches,
  };
}

export async function completeReceiving(
  input: CompleteReceivingInput,
): Promise<ServiceResult<{ goodsReceiptId: string; batchIds: string[]; accepted: boolean }>> {
  const fieldErrors = validateReceivingInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockCompleteReceiving(input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to complete receiving.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("complete_receiving_workflow", {
    p_purchase_order_id: input.purchaseOrderId,
    p_receipt_number: normalizeText(input.receiptNumber),
    p_received_at: input.receivedAt,
    p_driver_name: normalizeText(input.driverName),
    p_vehicle_number: normalizeText(input.vehicleNumber),
    p_notes: normalizeText(input.notes),
    p_received_by: asProfileId(session.id),
    p_actor_name: session.name,
    p_items: input.items.map((item) => ({
      purchase_order_item_id: item.purchaseOrderItemId,
      received_quantity: item.receivedQuantity,
      unit: item.unit,
      notes: item.notes,
    })),
    p_qaqc_inspection_date: input.qaqc.inspectionDate,
    p_qaqc_inspector_id: asProfileId(session.id),
    p_qaqc_result: input.qaqc.result,
    p_qaqc_notes: normalizeText(input.qaqc.notes),
    p_allow_over_receive: input.allowOverReceive,
  });

  if (error) {
    return fail(error.message.replace(/^.*exception:\s*/i, "") || "Unable to complete receiving.");
  }

  const payload = (data ?? {}) as NestedRow;

  return ok({
    goodsReceiptId: String(payload.goods_receipt_id ?? ""),
    batchIds: Array.isArray(payload.batch_ids) ? (payload.batch_ids as string[]) : [],
    accepted: Boolean(payload.accepted),
  });
}

export async function listBatches(): Promise<BatchListItem[]> {
  if (getPersistenceMode() === "mock") return mockListBatches();

  const client = await getClient();
  const { data, error } = await client
    .from("batches")
    .select(
      "id, batch_number, product_species, received_quantity, remaining_quantity, unit, received_at, status, goods_receipts(purchase_orders(vendors(vendor_name)))",
    )
    .order("received_at", { ascending: false });

  if (error) throw new Error("Unable to load batches.");

  return ((data ?? []) as NestedRow[]).map((batch) => {
    const receipt = Array.isArray(batch.goods_receipts) ? batch.goods_receipts[0] : batch.goods_receipts;
    const po = receipt && (Array.isArray(receipt.purchase_orders) ? receipt.purchase_orders[0] : receipt.purchase_orders);
    const vendor = po && (Array.isArray(po.vendors) ? po.vendors[0] : po.vendors);
    const receivedAt = batch.received_at as string;
    return {
      id: batch.id as string,
      batchNumber: batch.batch_number as string,
      productSpecies: batch.product_species as string,
      receivedQuantity: Number(batch.received_quantity),
      remainingQuantity: Number(batch.remaining_quantity),
      unit: batch.unit as string,
      receivedAt,
      freshUntil: getFreshUntil(receivedAt),
      freshStatus: getFreshWindowStatus(receivedAt),
      status: batch.status as string,
      vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
    };
  });
}

export async function getBatch(id: string): Promise<BatchDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetBatch(id);

  const client = await getClient();
  const { data: batch, error } = await client
    .from("batches")
    .select(
      "*, goods_receipts(id, receipt_number, purchase_order_id, purchase_orders(id, po_number, vendors(id, vendor_name, vendor_code)), incoming_qaqc(result)), inventory_items(id, quantity, inventory_type)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load batch.");
  if (!batch) return null;

  const row = batch as NestedRow;
  const receipt = Array.isArray(row.goods_receipts) ? row.goods_receipts[0] : row.goods_receipts;
  const po = receipt && (Array.isArray(receipt.purchase_orders) ? receipt.purchase_orders[0] : receipt.purchase_orders);
  const vendor = po && (Array.isArray(po.vendors) ? po.vendors[0] : po.vendors);
  const qaqc = receipt && (Array.isArray(receipt.incoming_qaqc) ? receipt.incoming_qaqc[0] : receipt.incoming_qaqc);
  const inventories = (Array.isArray(row.inventory_items) ? row.inventory_items : []) as NestedRow[];
  const inventory =
    inventories.find((item) => item.inventory_type === "raw") ?? inventories[0] ?? null;
  const receivedAt = row.received_at as string;

  const { data: runs, error: runsError } = await client
    .from("processing_runs")
    .select(
      "id, processing_run_number, processing_date, input_quantity, processed_quantity, wastage_quantity, input_unit, status, processing_qaqc(result)",
    )
    .eq("parent_batch_id", id)
    .order("processing_date", { ascending: false });

  if (runsError) throw new Error("Unable to load batch processing history.");

  const processingRuns = ((runs ?? []) as NestedRow[]).map((run) => {
    const runQaqc = Array.isArray(run.processing_qaqc) ? run.processing_qaqc[0] : run.processing_qaqc;
    return {
      id: run.id as string,
      processingRunNumber: run.processing_run_number as string,
      processingDate: run.processing_date as string,
      inputQuantity: Number(run.input_quantity),
      yieldQuantity: Number(run.processed_quantity),
      wastageQuantity: Number(run.wastage_quantity),
      unit: run.input_unit as string,
      status: run.status as string,
      qaqcResult: (runQaqc?.result as string | null | undefined) ?? null,
    };
  });

  return {
    id: row.id as string,
    batchNumber: row.batch_number as string,
    productSpecies: row.product_species as string,
    receivedQuantity: Number(row.received_quantity),
    remainingQuantity: Number(row.remaining_quantity),
    unit: row.unit as string,
    receivedAt,
    freshUntil: getFreshUntil(receivedAt),
    freshStatus: getFreshWindowStatus(receivedAt),
    status: row.status as string,
    vendorId: (vendor?.id as string | undefined) ?? "",
    vendorName: (vendor?.vendor_name as string | undefined) ?? "Unknown vendor",
    vendorCode: (vendor?.vendor_code as string | undefined) ?? "",
    goodsReceiptId: (receipt?.id as string | undefined) ?? (row.goods_receipt_id as string),
    receiptNumber: (receipt?.receipt_number as string | undefined) ?? "",
    purchaseOrderId: (po?.id as string | undefined) ?? "",
    poNumber: (po?.po_number as string | undefined) ?? "",
    qaqcResult: (qaqc?.result as string | null | undefined) ?? null,
    inventoryItemId: (inventory?.id as string | undefined) ?? null,
    inventoryQuantity: inventory ? Number(inventory.quantity) : null,
    inventoryType: (inventory?.inventory_type as string | undefined) ?? null,
    processingRuns,
  };
}
