import { normalizeCustomerPoStatus } from "@/lib/customer-order-labels";
import { roundQuantity } from "@/lib/quantity";
import type {
  CustomerInput,
  CustomerPoDashboardStats,
  CustomerPoDetail,
  CustomerPoInput,
  CustomerPoListFilters,
  CustomerPoListItem,
  CustomerPoStatus,
  CustomerRecord,
} from "@/types/customer-orders";
import type { CustomerPoFulfillmentSummary } from "@/types/fulfillment";

type MockCustomer = CustomerRecord;
export type MockPo = {
  id: string;
  customerId: string;
  poNumber: string;
  poDate: string | null;
  receivedAt: string;
  requiredDeliveryDate: string | null;
  priority: "normal" | "high" | "urgent";
  status: CustomerPoStatus;
  source: "manual" | "email" | "api" | "import";
  notes: string | null;
  actionRequired: boolean;
  actionRequiredReason: string | null;
  actionRequiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type MockItem = {
  id: string;
  customerPoId: string;
  lineNumber: number;
  productName: string;
  species: string;
  productCode: string | null;
  quantity: number;
  unit: string;
  requiredDeliveryDate: string | null;
  specifications: string | null;
  notes: string | null;
  status: string;
  fulfilledQuantity: number;
};
type MockHistory = {
  id: string;
  customerPoId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string | null;
  changedAt: string;
  reason: string | null;
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

type Store = {
  customers: MockCustomer[];
  purchaseOrders: MockPo[];
  items: MockItem[];
  history: MockHistory[];
  audits: MockAudit[];
  customerCounter: number;
};

const globalStore = globalThis as typeof globalThis & { __seadockCustomerOrderStore?: Store };

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function seedStore(store: Store) {
  if (store.customers.length) return;
  const now = nowIso();
  const customer: MockCustomer = {
    id: "cust_example_001",
    customerCode: "CUST-00001",
    name: "Example Seafood Buyer",
    email: "buyer@example-seafood.test",
    phone: "+971-4-000-0000",
    address: "Dubai Seafood Market",
    contactPerson: "Sara Ali",
    status: "active",
    notes: "Seed customer for UI development",
    createdAt: now,
    updatedAt: now,
  };
  store.customers.push(customer);
  store.customerCounter = 1;

  const po: MockPo = {
    id: "cpo_seed_1001",
    customerId: customer.id,
    poNumber: "PO-1001",
    poDate: "2026-11-12",
    receivedAt: "2026-11-12T08:00:00.000Z",
    requiredDeliveryDate: "2026-11-14",
    priority: "high",
    status: "approved",
    source: "manual",
    notes: "Seed high-priority PO",
    actionRequired: false,
    actionRequiredReason: null,
    actionRequiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.purchaseOrders.push(po);
  store.items.push({
    id: "cpoi_seed_1",
    customerPoId: po.id,
    lineNumber: 1,
    productName: "Frozen Fish Fillet",
    species: "Frozen Fish Fillet",
    productCode: "FFF-01",
    quantity: 500,
    unit: "kg",
    requiredDeliveryDate: "2026-11-14",
    specifications: "Frozen, IQF",
    notes: null,
    status: "open",
    fulfilledQuantity: 0,
  });
  store.history.push({
    id: "hist_seed_1",
    customerPoId: po.id,
    fromStatus: null,
    toStatus: "received",
    changedByName: "System",
    changedAt: now,
    reason: "Initial intake",
    notes: "Seeded customer PO",
  });
  store.history.unshift({
    id: "hist_seed_2",
    customerPoId: po.id,
    fromStatus: "received",
    toStatus: "approved",
    changedByName: "System",
    changedAt: now,
    reason: "Seed approval",
    notes: "Approved so inventory can be allocated",
  });
}

function getStore(): Store {
  if (!globalStore.__seadockCustomerOrderStore) {
    globalStore.__seadockCustomerOrderStore = {
      customers: [],
      purchaseOrders: [],
      items: [],
      history: [],
      audits: [],
      customerCounter: 0,
    };
    seedStore(globalStore.__seadockCustomerOrderStore);
  }
  return globalStore.__seadockCustomerOrderStore;
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

function nextCustomerCode(store: Store): string {
  store.customerCounter += 1;
  return `CUST-${String(store.customerCounter).padStart(5, "0")}`;
}

function summarizeFulfilled(store: Store, poId: string): CustomerPoFulfillmentSummary {
  const items = store.items.filter((item) => item.customerPoId === poId && item.status !== "cancelled");
  const requested = roundQuantity(items.reduce((sum, item) => sum + item.quantity, 0));
  const fulfilled = roundQuantity(items.reduce((sum, item) => sum + item.fulfilledQuantity, 0));
  return {
    requestedQuantity: requested,
    allocatedQuantity: 0,
    fulfilledQuantity: fulfilled,
    remainingQuantity: roundQuantity(requested - fulfilled),
    unallocatedQuantity: roundQuantity(requested - fulfilled),
    activeAllocationCount: 0,
    fulfilmentCount: 0,
  };
}

function mapCustomer(row: MockCustomer): CustomerRecord {
  return { ...row };
}

export function mockListCustomers(): CustomerRecord[] {
  return [...getStore().customers].sort((a, b) => a.customerCode.localeCompare(b.customerCode));
}

export function mockGetCustomer(id: string): CustomerRecord | null {
  const row = getStore().customers.find((customer) => customer.id === id);
  return row ? mapCustomer(row) : null;
}

export function mockCreateCustomer(input: CustomerInput, actorName: string): CustomerRecord {
  const store = getStore();
  const code = input.customerCode.trim() || nextCustomerCode(store);
  if (store.customers.some((row) => row.customerCode.toLowerCase() === code.toLowerCase())) {
    throw new Error("A customer with this code already exists.");
  }
  const now = nowIso();
  const customer: MockCustomer = {
    id: createId("cust"),
    customerCode: code,
    name: input.name.trim(),
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    address: input.address.trim() || null,
    contactPerson: input.contactPerson.trim() || null,
    status: input.status,
    notes: input.notes.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  store.customers.push(customer);
  pushAudit(store, {
    actorName,
    action: "Customer Created",
    entityType: "customer",
    entityId: customer.id,
    entityLabel: customer.customerCode,
    field: "customer_code",
    newValue: customer.customerCode,
  });
  return mapCustomer(customer);
}

export function mockUpdateCustomer(id: string, input: CustomerInput, actorName: string): CustomerRecord {
  const store = getStore();
  const customer = store.customers.find((row) => row.id === id);
  if (!customer) throw new Error("Customer not found.");
  const code = input.customerCode.trim();
  if (
    store.customers.some(
      (row) => row.id !== id && row.customerCode.toLowerCase() === code.toLowerCase(),
    )
  ) {
    throw new Error("A customer with this code already exists.");
  }
  const previousName = customer.name;
  customer.customerCode = code;
  customer.name = input.name.trim();
  customer.email = input.email.trim() || null;
  customer.phone = input.phone.trim() || null;
  customer.address = input.address.trim() || null;
  customer.contactPerson = input.contactPerson.trim() || null;
  customer.status = input.status;
  customer.notes = input.notes.trim() || null;
  customer.updatedAt = nowIso();
  pushAudit(store, {
    actorName,
    action: "Customer Updated",
    entityType: "customer",
    entityId: customer.id,
    entityLabel: customer.customerCode,
    field: "name",
    previousValue: previousName,
    newValue: customer.name,
  });
  return mapCustomer(customer);
}

function toListItem(store: Store, po: MockPo): CustomerPoListItem {
  const customer = store.customers.find((row) => row.id === po.customerId);
  return {
    id: po.id,
    poNumber: po.poNumber,
    customerId: po.customerId,
    customerName: customer?.name ?? "Unknown customer",
    customerCode: customer?.customerCode ?? "",
    poDate: po.poDate,
    receivedAt: po.receivedAt,
    requiredDeliveryDate: po.requiredDeliveryDate,
    priority: po.priority,
    status: normalizeCustomerPoStatus(po.status),
    actionRequired: po.actionRequired,
    itemCount: store.items.filter((item) => item.customerPoId === po.id).length,
    source: po.source,
  };
}

export function mockListCustomerPurchaseOrders(filters: CustomerPoListFilters = {}): CustomerPoListItem[] {
  const store = getStore();
  const dueSoonCutoff = filters.dueSoonHours
    ? Date.now() + filters.dueSoonHours * 60 * 60 * 1000
    : null;

  return store.purchaseOrders
    .map((po) => toListItem(store, po))
    .filter((po) => {
      if (filters.status && po.status !== filters.status) return false;
      if (filters.priority && po.priority !== filters.priority) return false;
      if (filters.actionRequired && !po.actionRequired) return false;
      if (dueSoonCutoff != null) {
        if (!po.requiredDeliveryDate) return false;
        const due = new Date(po.requiredDeliveryDate).getTime();
        if (Number.isNaN(due) || due > dueSoonCutoff || due < Date.now() - 24 * 60 * 60 * 1000) return false;
        if (["fulfilled", "cancelled"].includes(po.status)) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const haystack = `${po.poNumber} ${po.customerName} ${po.customerCode}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function mockGetCustomerPurchaseOrder(id: string): CustomerPoDetail | null {
  const store = getStore();
  const po = store.purchaseOrders.find((row) => row.id === id);
  if (!po) return null;
  const customer = store.customers.find((row) => row.id === po.customerId);
  return {
    id: po.id,
    poNumber: po.poNumber,
    customerId: po.customerId,
    customerName: customer?.name ?? "Unknown customer",
    customerCode: customer?.customerCode ?? "",
    poDate: po.poDate,
    receivedAt: po.receivedAt,
    requiredDeliveryDate: po.requiredDeliveryDate,
    priority: po.priority,
    status: normalizeCustomerPoStatus(po.status),
    source: po.source,
    notes: po.notes,
    actionRequired: po.actionRequired,
    actionRequiredReason: po.actionRequiredReason,
    actionRequiredAt: po.actionRequiredAt,
    items: store.items
      .filter((item) => item.customerPoId === po.id)
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((item) => ({
        id: item.id,
        lineNumber: item.lineNumber,
        productName: item.productName,
        species: item.species,
        productCode: item.productCode,
        quantity: item.quantity,
        unit: item.unit,
        requiredDeliveryDate: item.requiredDeliveryDate,
        specifications: item.specifications,
        notes: item.notes,
        status: item.status,
        fulfilledQuantity: item.fulfilledQuantity,
        allocatedQuantity: 0,
        remainingQuantity: roundQuantity(item.quantity - item.fulfilledQuantity),
      })),
    fulfillment: summarizeFulfilled(store, po.id),
    statusHistory: store.history
      .filter((row) => row.customerPoId === po.id)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    audits: store.audits
      .filter((row) => row.entityId === po.id || row.entityLabel === po.poNumber)
      .map((row) => ({
        id: row.id,
        actorName: row.actorName,
        action: row.action,
        field: row.field,
        previousValue: row.previousValue,
        newValue: row.newValue,
        timestamp: row.timestamp,
      })),
  };
}

export function mockCreateCustomerPurchaseOrder(input: CustomerPoInput, actorName: string) {
  const store = getStore();
  const customer = store.customers.find((row) => row.id === input.customerId);
  if (!customer) throw new Error("Customer not found.");
  if (customer.status !== "active") throw new Error("Customer is not active.");
  if (
    store.purchaseOrders.some(
      (row) =>
        row.customerId === input.customerId &&
        row.poNumber.toLowerCase() === input.poNumber.trim().toLowerCase(),
    )
  ) {
    throw new Error("A purchase order with this number already exists for the selected customer.");
  }

  const items = input.items.filter((item) => item.productName.trim() || item.species.trim() || item.quantity > 0);
  if (!items.length) throw new Error("At least one PO item is required.");

  const now = nowIso();
  const po: MockPo = {
    id: createId("cpo"),
    customerId: customer.id,
    poNumber: input.poNumber.trim(),
    poDate: input.poDate || null,
    receivedAt: input.receivedAt,
    requiredDeliveryDate: input.requiredDeliveryDate || null,
    priority: input.priority,
    status: "received",
    source: input.source ?? "manual",
    notes: input.notes.trim() || null,
    actionRequired: false,
    actionRequiredReason: null,
    actionRequiredAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.purchaseOrders.push(po);

  items.forEach((item, index) => {
    const productName = item.productName.trim() || item.species.trim();
    store.items.push({
      id: createId("cpoi"),
      customerPoId: po.id,
      lineNumber: index + 1,
      productName,
      species: item.species.trim() || productName,
      productCode: item.productCode.trim() || null,
      quantity: item.quantity,
      unit: item.unit.trim() || "kg",
      requiredDeliveryDate: item.requiredDeliveryDate || null,
      specifications: item.specifications.trim() || null,
      notes: item.notes.trim() || null,
      status: "open",
      fulfilledQuantity: 0,
    });
  });

  store.history.unshift({
    id: createId("hist"),
    customerPoId: po.id,
    fromStatus: null,
    toStatus: "received",
    changedByName: actorName,
    changedAt: now,
    reason: "Initial intake",
    notes: "Customer PO created",
  });

  pushAudit(store, {
    actorName,
    action: "Customer PO Created",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "status",
    newValue: "received",
  });
  pushAudit(store, {
    actorName,
    action: "Customer PO Priority Changed",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "priority",
    newValue: po.priority,
  });

  return { customerPurchaseOrderId: po.id, poNumber: po.poNumber };
}

export function mockChangeCustomerPoStatus(
  id: string,
  input: {
    toStatus: CustomerPoStatus;
    reason: string;
    notes: string;
    markActionRequired?: boolean;
    actionRequiredReason?: string;
  },
  actorName: string,
) {
  const store = getStore();
  const po = store.purchaseOrders.find((row) => row.id === id);
  if (!po) throw new Error("Customer purchase order not found.");

  const fromStatus = po.status;
  const markActionRequired =
    input.markActionRequired ?? (input.toStatus === "action_required" ? true : undefined);
  const actionRequired =
    markActionRequired != null
      ? markActionRequired
      : input.toStatus === "action_required"
        ? true
        : ["approved", "cancelled", "fulfilled"].includes(input.toStatus)
          ? false
          : po.actionRequired;

  if (actionRequired && !(input.actionRequiredReason?.trim() || input.reason.trim() || po.actionRequiredReason)) {
    throw new Error("Action required reason is required.");
  }

  if (fromStatus === input.toStatus && actionRequired === po.actionRequired) {
    throw new Error("No status change requested.");
  }

  po.status = input.toStatus;
  po.actionRequired = actionRequired;
  po.actionRequiredReason = actionRequired
    ? input.actionRequiredReason?.trim() || input.reason.trim() || po.actionRequiredReason
    : null;
  po.actionRequiredAt = actionRequired ? nowIso() : null;
  po.updatedAt = nowIso();

  store.history.unshift({
    id: createId("hist"),
    customerPoId: po.id,
    fromStatus,
    toStatus: input.toStatus,
    changedByName: actorName,
    changedAt: nowIso(),
    reason: input.reason.trim() || null,
    notes: input.notes.trim() || null,
  });

  pushAudit(store, {
    actorName,
    action: "Customer PO Status Changed",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "status",
    previousValue: fromStatus,
    newValue: input.toStatus,
  });

  if (actionRequired) {
    pushAudit(store, {
      actorName,
      action: "Customer PO Marked Action Required",
      entityType: "customer_purchase_order",
      entityId: po.id,
      entityLabel: po.poNumber,
      field: "action_required_reason",
      newValue: po.actionRequiredReason,
    });
  }
  if (input.toStatus === "approved") {
    pushAudit(store, {
      actorName,
      action: "Customer PO Approved",
      entityType: "customer_purchase_order",
      entityId: po.id,
      entityLabel: po.poNumber,
      field: "status",
      previousValue: fromStatus,
      newValue: "approved",
    });
  }
  if (input.toStatus === "cancelled") {
    pushAudit(store, {
      actorName,
      action: "Customer PO Cancelled",
      entityType: "customer_purchase_order",
      entityId: po.id,
      entityLabel: po.poNumber,
      field: "status",
      previousValue: fromStatus,
      newValue: "cancelled",
    });
  }

  return { customerPurchaseOrderId: po.id, fromStatus, toStatus: po.status, actionRequired: po.actionRequired };
}

export function mockUpdateCustomerPoPriority(
  id: string,
  priority: "normal" | "high" | "urgent",
  actorName: string,
) {
  const store = getStore();
  const po = store.purchaseOrders.find((row) => row.id === id);
  if (!po) throw new Error("Customer purchase order not found.");
  const previous = po.priority;
  po.priority = priority;
  po.updatedAt = nowIso();
  pushAudit(store, {
    actorName,
    action: "Customer PO Priority Changed",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "priority",
    previousValue: previous,
    newValue: priority,
  });
  pushAudit(store, {
    actorName,
    action: "Customer PO Updated",
    entityType: "customer_purchase_order",
    entityId: po.id,
    entityLabel: po.poNumber,
    field: "priority",
    previousValue: previous,
    newValue: priority,
  });
  return po;
}

export function mockCustomerPoDashboardStats(): CustomerPoDashboardStats {
  const store = getStore();
  const dueSoonCutoff = Date.now() + 48 * 60 * 60 * 1000;
  const openStatuses = new Set(["received", "under_review", "action_required", "approved", "partially_allocated"]);
  const countStatus = (status: CustomerPoStatus) =>
    store.purchaseOrders.filter((po) => po.status === status).length;
  return {
    awaitingAllocation: countStatus("approved"),
    partiallyAllocated: countStatus("partially_allocated"),
    readyForFulfillment: countStatus("ready_for_fulfillment"),
    partiallyFulfilled: countStatus("partially_fulfilled"),
    pendingCustomerPos: store.purchaseOrders.filter((po) => openStatuses.has(po.status)).length,
    actionRequired: store.purchaseOrders.filter((po) => po.actionRequired || po.status === "action_required").length,
    urgent: store.purchaseOrders.filter(
      (po) => po.priority === "urgent" && !["fulfilled", "cancelled"].includes(po.status),
    ).length,
    dueSoon: store.purchaseOrders.filter((po) => {
      if (["fulfilled", "cancelled"].includes(po.status) || !po.requiredDeliveryDate) return false;
      const due = new Date(po.requiredDeliveryDate).getTime();
      return !Number.isNaN(due) && due <= dueSoonCutoff;
    }).length,
  };
}

/**
 * Live store access for the fulfilment store. Keeps PO state in one place
 * without making the customer order store depend on allocation logic.
 */
export function getMockCustomerOrderContext() {
  const store = getStore();
  return {
    store,
    customers: store.customers,
    purchaseOrders: store.purchaseOrders,
    items: store.items,
    createId,
    nowIso,
    pushAudit: (input: Parameters<typeof pushAudit>[1]) => pushAudit(store, input),
    pushHistory: (input: {
      customerPoId: string;
      fromStatus: string | null;
      toStatus: string;
      changedByName: string | null;
      reason: string | null;
      notes: string | null;
    }) => {
      store.history.unshift({
        id: createId("hist"),
        changedAt: nowIso(),
        ...input,
      });
    },
  };
}
