import "server-only";

import { asProfileId } from "@/lib/authz";
import { normalizeCustomerPoStatus } from "@/lib/customer-order-labels";
import {
  normalizeText,
  validateCustomerInput,
  validateCustomerPoInput,
} from "@/lib/customer-order-validation";
import {
  mockChangeCustomerPoStatus,
  mockCreateCustomer,
  mockCreateCustomerPurchaseOrder,
  mockCustomerPoDashboardStats,
  mockGetCustomer,
  mockGetCustomerPurchaseOrder,
  mockListCustomerPurchaseOrders,
  mockListCustomers,
  mockUpdateCustomer,
  mockUpdateCustomerPoPriority,
} from "@/lib/mock/customer-order-store";
import { getSession } from "@/services/auth/get-session";
import { recordAuditEntry } from "@/services/audit/audit-service";
import { getDatabaseClient, getPersistenceMode } from "@/services/db/client";
import {
  cancelPoReleasingAllocations,
  getCustomerPoFulfillmentDetail,
  listMockFulfillmentAuditsForPo,
} from "@/services/fulfillment/fulfillment-service";
import type {
  CustomerInput,
  CustomerPoDashboardStats,
  CustomerPoDetail,
  CustomerPoInput,
  CustomerPoListFilters,
  CustomerPoListItem,
  CustomerPoStatus,
  CustomerRecord,
  ServiceResult,
} from "@/types/customer-orders";
import type { CustomerPoPriority, Database } from "@/types/database";

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail<T = never>(error: string, fieldErrors?: Record<string, string>): ServiceResult<T> {
  return { ok: false, error, fieldErrors };
}

type NestedRow = { [key: string]: unknown };

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

function cleanRpcMessage(message: string): string {
  return message.replace(/^.*exception:\s*/i, "") || "Unable to complete the request.";
}

function mapCustomer(row: Database["public"]["Tables"]["customers"]["Row"]): CustomerRecord {
  return {
    id: row.id,
    customerCode: row.customer_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    contactPerson: row.contact_person,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCustomers(): Promise<CustomerRecord[]> {
  if (getPersistenceMode() === "mock") return mockListCustomers();
  const client = await getClient();
  const { data, error } = await client.from("customers").select("*").order("customer_code");
  if (error) throw new Error("Unable to load customers.");
  return (data ?? []).map(mapCustomer);
}

export async function getCustomer(id: string): Promise<CustomerRecord | null> {
  if (getPersistenceMode() === "mock") return mockGetCustomer(id);
  const client = await getClient();
  const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load customer.");
  return data ? mapCustomer(data) : null;
}

export async function createCustomer(input: CustomerInput): Promise<ServiceResult<CustomerRecord>> {
  const fieldErrors = validateCustomerInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockCreateCustomer(input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create customer.");
    }
  }

  const client = await getClient(true);
  let customerCode = normalizeText(input.customerCode);
  if (!customerCode) {
    const { data: generated, error: codeError } = await client.rpc("next_customer_code");
    if (codeError) return fail("Unable to generate customer code.");
    customerCode = String(generated);
  }

  const { data, error } = await client
    .from("customers")
    .insert({
      customer_code: customerCode,
      name: normalizeText(input.name),
      email: normalizeText(input.email) || null,
      phone: normalizeText(input.phone) || null,
      address: normalizeText(input.address) || null,
      contact_person: normalizeText(input.contactPerson) || null,
      status: input.status,
      notes: normalizeText(input.notes) || null,
    })
    .select("*")
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return fail("A customer with this code already exists.", { customerCode: "Customer code must be unique." });
    }
    return fail("Unable to create customer.");
  }

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Customer Created",
    recordType: "customer",
    recordId: data.id,
    recordLabel: data.customer_code,
    field: "customer_code",
    previousValue: null,
    newValue: data.customer_code,
  });

  return ok(mapCustomer(data));
}

export async function updateCustomer(
  id: string,
  input: CustomerInput,
): Promise<ServiceResult<CustomerRecord>> {
  const fieldErrors = validateCustomerInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockUpdateCustomer(id, input, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to update customer.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client
    .from("customers")
    .update({
      customer_code: normalizeText(input.customerCode),
      name: normalizeText(input.name),
      email: normalizeText(input.email) || null,
      phone: normalizeText(input.phone) || null,
      address: normalizeText(input.address) || null,
      contact_person: normalizeText(input.contactPerson) || null,
      status: input.status,
      notes: normalizeText(input.notes) || null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (/unique|duplicate/i.test(error.message)) {
      return fail("A customer with this code already exists.", { customerCode: "Customer code must be unique." });
    }
    return fail("Unable to update customer.");
  }

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Customer Updated",
    recordType: "customer",
    recordId: data.id,
    recordLabel: data.customer_code,
    field: "name",
    previousValue: null,
    newValue: data.name,
  });

  return ok(mapCustomer(data));
}

export async function listCustomerPurchaseOrders(
  filters: CustomerPoListFilters = {},
): Promise<CustomerPoListItem[]> {
  if (getPersistenceMode() === "mock") return mockListCustomerPurchaseOrders(filters);

  const client = await getClient();
  let query = client
    .from("customer_purchase_orders")
    .select(
      "id, po_number, customer_id, customer_name, customer_reference, po_date, received_at, required_date, priority, status, action_required, source, customer_purchase_order_items(count)",
    )
    .order("received_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status as Database["public"]["Tables"]["customer_purchase_orders"]["Row"]["status"]);
  if (filters.priority) {
    query = query.eq("priority", filters.priority as Database["public"]["Tables"]["customer_purchase_orders"]["Row"]["priority"]);
  }
  if (filters.actionRequired) query = query.eq("action_required", true);

  const { data, error } = await query;
  if (error) throw new Error("Unable to load customer purchase orders.");

  const dueSoonCutoff = filters.dueSoonHours
    ? Date.now() + filters.dueSoonHours * 60 * 60 * 1000
    : null;

  return ((data ?? []) as NestedRow[])
    .map((row) => {
      const items = Array.isArray(row.customer_purchase_order_items)
        ? row.customer_purchase_order_items[0]
        : row.customer_purchase_order_items;
      return {
        id: row.id as string,
        poNumber: row.po_number as string,
        customerId: (row.customer_id as string | null) ?? "",
        customerName: row.customer_name as string,
        customerCode: (row.customer_reference as string | null) ?? "",
        poDate: (row.po_date as string | null) ?? null,
        receivedAt: row.received_at as string,
        requiredDeliveryDate: (row.required_date as string | null) ?? null,
        priority: row.priority as CustomerPoPriority,
        status: normalizeCustomerPoStatus(row.status as string),
        actionRequired: Boolean(row.action_required),
        itemCount: Number((items as NestedRow | undefined)?.count ?? 0),
        source: row.source as CustomerPoListItem["source"],
      };
    })
    .filter((po) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!`${po.poNumber} ${po.customerName} ${po.customerCode}`.toLowerCase().includes(q)) return false;
      }
      if (dueSoonCutoff != null) {
        if (!po.requiredDeliveryDate) return false;
        const due = new Date(po.requiredDeliveryDate).getTime();
        if (Number.isNaN(due) || due > dueSoonCutoff) return false;
        if (["fulfilled", "cancelled"].includes(po.status)) return false;
      }
      return true;
    });
}

/** Adds allocation and fulfilment figures from the fulfilment service to a PO detail. */
async function withFulfillment(detail: CustomerPoDetail): Promise<CustomerPoDetail> {
  const fulfillment = await getCustomerPoFulfillmentDetail(detail.id);
  if (!fulfillment) return detail;

  const byItem = new Map(fulfillment.items.map((item) => [item.customerPoItemId, item]));
  const audits =
    getPersistenceMode() === "mock"
      ? [...detail.audits, ...listMockFulfillmentAuditsForPo(detail.id)].sort((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        )
      : detail.audits;

  return {
    ...detail,
    items: detail.items.map((item) => {
      const reconciled = byItem.get(item.id);
      if (!reconciled) return item;
      return {
        ...item,
        fulfilledQuantity: reconciled.fulfilledQuantity,
        allocatedQuantity: reconciled.allocatedQuantity,
        remainingQuantity: reconciled.remainingQuantity,
      };
    }),
    fulfillment: {
      ...fulfillment.totals,
      activeAllocationCount: fulfillment.allocations.filter((row) => row.status === "active").length,
      fulfilmentCount: fulfillment.fulfilments.filter((row) => row.status !== "cancelled").length,
    },
    audits,
  };
}

export async function getCustomerPurchaseOrder(id: string): Promise<CustomerPoDetail | null> {
  const detail = await loadCustomerPurchaseOrder(id);
  return detail ? withFulfillment(detail) : null;
}

async function loadCustomerPurchaseOrder(id: string): Promise<CustomerPoDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetCustomerPurchaseOrder(id);

  const client = await getClient();
  const { data, error } = await client
    .from("customer_purchase_orders")
    .select(
      "*, customers(id, customer_code, name), customer_purchase_order_items(*), customer_purchase_order_status_history(*)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load customer purchase order.");
  if (!data) return null;

  const row = data as NestedRow;
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  const items = (Array.isArray(row.customer_purchase_order_items) ? row.customer_purchase_order_items : []) as NestedRow[];
  const history = (Array.isArray(row.customer_purchase_order_status_history)
    ? row.customer_purchase_order_status_history
    : []) as NestedRow[];

  const { data: audits } = await client
    .from("audit_logs")
    .select("id, actor_name, action, field_name, previous_value, new_value, created_at")
    .or(`entity_id.eq.${id},metadata->>customer_po_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    id: row.id as string,
    poNumber: row.po_number as string,
    customerId: (customer?.id as string | undefined) ?? ((row.customer_id as string | null) ?? ""),
    customerName: (customer?.name as string | undefined) ?? (row.customer_name as string),
    customerCode:
      (customer?.customer_code as string | undefined) ?? ((row.customer_reference as string | null) ?? ""),
    poDate: (row.po_date as string | null) ?? null,
    receivedAt: row.received_at as string,
    requiredDeliveryDate: (row.required_date as string | null) ?? null,
    priority: row.priority as CustomerPoPriority,
    status: normalizeCustomerPoStatus(row.status as string),
    source: row.source as CustomerPoDetail["source"],
    notes: (row.notes as string | null) ?? null,
    actionRequired: Boolean(row.action_required),
    actionRequiredReason: (row.action_required_reason as string | null) ?? null,
    actionRequiredAt: (row.action_required_at as string | null) ?? null,
    items: items
      .map((item) => ({
        id: item.id as string,
        lineNumber: Number(item.line_number ?? 0),
        productName: (item.product_name as string | null) ?? (item.product_species as string),
        species: item.product_species as string,
        productCode: (item.product_code as string | null) ?? null,
        quantity: Number(item.requested_quantity),
        unit: item.unit as string,
        requiredDeliveryDate: (item.required_delivery_date as string | null) ?? null,
        specifications: (item.specifications as string | null) ?? null,
        notes: (item.notes as string | null) ?? null,
        status: item.status as string,
        fulfilledQuantity: Number(item.fulfilled_quantity ?? 0),
        allocatedQuantity: 0,
        remainingQuantity: Number(item.requested_quantity) - Number(item.fulfilled_quantity ?? 0),
      }))
      .sort((a, b) => a.lineNumber - b.lineNumber),
    fulfillment: {
      requestedQuantity: items.reduce((sum, item) => sum + Number(item.requested_quantity), 0),
      allocatedQuantity: 0,
      fulfilledQuantity: items.reduce((sum, item) => sum + Number(item.fulfilled_quantity ?? 0), 0),
      remainingQuantity: items.reduce(
        (sum, item) => sum + Number(item.requested_quantity) - Number(item.fulfilled_quantity ?? 0),
        0,
      ),
      unallocatedQuantity: 0,
      activeAllocationCount: 0,
      fulfilmentCount: 0,
    },
    statusHistory: history
      .map((entry) => ({
        id: entry.id as string,
        fromStatus: (entry.from_status as string | null) ?? null,
        toStatus: entry.to_status as string,
        changedByName: (entry.changed_by_name as string | null) ?? null,
        changedAt: entry.changed_at as string,
        reason: (entry.reason as string | null) ?? null,
        notes: (entry.notes as string | null) ?? null,
      }))
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    audits: ((audits ?? []) as NestedRow[]).map((audit) => ({
      id: audit.id as string,
      actorName: audit.actor_name as string,
      action: audit.action as string,
      field: (audit.field_name as string | null) ?? null,
      previousValue: (audit.previous_value as string | null) ?? null,
      newValue: (audit.new_value as string | null) ?? null,
      timestamp: audit.created_at as string,
    })),
  };
}

export async function createCustomerPurchaseOrder(
  input: CustomerPoInput,
): Promise<ServiceResult<{ customerPurchaseOrderId: string; poNumber: string }>> {
  const fieldErrors = validateCustomerPoInput(input);
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);
  const session = getSession();

  const receivedAtRaw = input.receivedAt;
  const receivedAtDate = new Date(receivedAtRaw);
  const receivedAt = Number.isNaN(receivedAtDate.getTime()) ? receivedAtRaw : receivedAtDate.toISOString();

  if (getPersistenceMode() === "mock") {
    try {
      return ok(mockCreateCustomerPurchaseOrder({ ...input, receivedAt }, session.name));
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to create customer purchase order.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("create_customer_purchase_order", {
    p_customer_id: input.customerId,
    p_po_number: normalizeText(input.poNumber),
    p_po_date: input.poDate || null,
    p_received_at: receivedAt,
    p_required_delivery_date: input.requiredDeliveryDate || null,
    p_priority: input.priority,
    p_notes: normalizeText(input.notes),
    p_source: input.source ?? "manual",
    p_created_by: asProfileId(session.id),
    p_actor_name: session.name,
    p_items: input.items.map((item, index) => ({
      line_number: index + 1,
      product_name: normalizeText(item.productName) || normalizeText(item.species),
      species: normalizeText(item.species) || normalizeText(item.productName),
      product_code: normalizeText(item.productCode),
      quantity: item.quantity,
      unit: normalizeText(item.unit) || "kg",
      required_delivery_date: item.requiredDeliveryDate || null,
      specifications: normalizeText(item.specifications),
      notes: normalizeText(item.notes),
    })),
  });

  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    customerPurchaseOrderId: String(payload.customer_purchase_order_id ?? ""),
    poNumber: String(payload.po_number ?? input.poNumber),
  });
}

export async function changeCustomerPurchaseOrderStatus(
  id: string,
  input: {
    toStatus: CustomerPoStatus;
    reason: string;
    notes: string;
    markActionRequired?: boolean;
    actionRequiredReason?: string;
  },
): Promise<ServiceResult<{ customerPurchaseOrderId: string }>> {
  const session = getSession();

  // Cancelling must release reserved stock, so it always goes through the allocation flow.
  if (input.toStatus === "cancelled") {
    const cancelled = await cancelPoReleasingAllocations(id, input.reason || input.notes);
    if (!cancelled.ok) return fail(cancelled.error, cancelled.fieldErrors);
    return ok({ customerPurchaseOrderId: id });
  }

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockChangeCustomerPoStatus(id, input, session.name);
      return ok({ customerPurchaseOrderId: result.customerPurchaseOrderId });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to change status.");
    }
  }

  const client = await getClient(true);
  const { error } = await client.rpc("change_customer_purchase_order_status", {
    p_customer_po_id: id,
    p_to_status: input.toStatus,
    p_reason: normalizeText(input.reason),
    p_notes: normalizeText(input.notes),
    p_changed_by: asProfileId(session.id),
    p_actor_name: session.name,
    p_mark_action_required: input.markActionRequired ?? null,
    p_action_required_reason: input.actionRequiredReason?.trim() || null,
  });

  if (error) return fail(cleanRpcMessage(error.message));
  return ok({ customerPurchaseOrderId: id });
}

export async function updateCustomerPurchaseOrderPriority(
  id: string,
  priority: CustomerPoPriority,
): Promise<ServiceResult<{ customerPurchaseOrderId: string }>> {
  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      mockUpdateCustomerPoPriority(id, priority, session.name);
      return ok({ customerPurchaseOrderId: id });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to update priority.");
    }
  }

  const client = await getClient(true);
  const existing = await getCustomerPurchaseOrder(id);
  if (!existing) return fail("Customer purchase order not found.");

  const { error } = await client
    .from("customer_purchase_orders")
    .update({ priority })
    .eq("id", id);

  if (error) return fail("Unable to update priority.");

  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Customer PO Priority Changed",
    recordType: "customer_purchase_order",
    recordId: id,
    recordLabel: existing.poNumber,
    field: "priority",
    previousValue: existing.priority,
    newValue: priority,
  });
  await recordAuditEntry({
    actorId: session.id,
    actorName: session.name,
    action: "Customer PO Updated",
    recordType: "customer_purchase_order",
    recordId: id,
    recordLabel: existing.poNumber,
    field: "priority",
    previousValue: existing.priority,
    newValue: priority,
  });

  return ok({ customerPurchaseOrderId: id });
}

export async function getCustomerPoDashboardStats(): Promise<CustomerPoDashboardStats> {
  if (getPersistenceMode() === "mock") return mockCustomerPoDashboardStats();

  const client = await getClient();
  const { data, error } = await client
    .from("customer_purchase_orders")
    .select("status, priority, action_required, required_date");

  if (error) throw new Error("Unable to load customer PO dashboard stats.");

  const dueSoonCutoff = Date.now() + 48 * 60 * 60 * 1000;
  const openStatuses = new Set([
    "received",
    "under_review",
    "action_required",
    "approved",
    "partially_allocated",
    "awaiting_verification",
    "verified",
  ]);

  const rows = (data ?? []) as NestedRow[];
  const countStatus = (status: string) => rows.filter((row) => row.status === status).length;
  return {
    awaitingAllocation: countStatus("approved") + countStatus("verified"),
    partiallyAllocated: countStatus("partially_allocated"),
    readyForFulfillment: countStatus("ready_for_fulfillment") + countStatus("pending_fulfilment"),
    partiallyFulfilled: countStatus("partially_fulfilled"),
    pendingCustomerPos: rows.filter((row) => openStatuses.has(String(row.status))).length,
    actionRequired: rows.filter(
      (row) => Boolean(row.action_required) || row.status === "action_required",
    ).length,
    urgent: rows.filter(
      (row) => row.priority === "urgent" && !["fulfilled", "cancelled"].includes(String(row.status)),
    ).length,
    dueSoon: rows.filter((row) => {
      if (["fulfilled", "cancelled"].includes(String(row.status)) || !row.required_date) return false;
      const due = new Date(String(row.required_date)).getTime();
      return !Number.isNaN(due) && due <= dueSoonCutoff;
    }).length,
  };
}
