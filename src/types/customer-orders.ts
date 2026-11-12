import type { CustomerPoFulfillmentSummary } from "@/types/fulfillment";
import type {
  CustomerPoDbStatus,
  CustomerPoPriority,
  CustomerPoSource,
  CustomerStatus,
} from "@/types/database";

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type CustomerPoStatus =
  | "received"
  | "under_review"
  | "action_required"
  | "approved"
  | "partially_allocated"
  | "ready_for_fulfillment"
  | "partially_fulfilled"
  | "fulfilled"
  | "cancelled";

export interface CustomerInput {
  customerCode: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  contactPerson: string;
  status: CustomerStatus;
  notes: string;
}

export interface CustomerRecord {
  id: string;
  customerCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactPerson: string | null;
  status: CustomerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPoItemInput {
  productName: string;
  species: string;
  productCode: string;
  quantity: number;
  unit: string;
  requiredDeliveryDate: string;
  specifications: string;
  notes: string;
}

export interface CustomerPoInput {
  customerId: string;
  poNumber: string;
  poDate: string;
  receivedAt: string;
  requiredDeliveryDate: string;
  priority: CustomerPoPriority;
  notes: string;
  source?: CustomerPoSource;
  items: CustomerPoItemInput[];
}

export interface CustomerPoListItem {
  id: string;
  poNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  poDate: string | null;
  receivedAt: string;
  requiredDeliveryDate: string | null;
  priority: CustomerPoPriority;
  status: CustomerPoStatus;
  actionRequired: boolean;
  itemCount: number;
  source: CustomerPoSource;
}

export interface CustomerPoItemRecord {
  id: string;
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
  /** Dispatched to the customer. */
  fulfilledQuantity: number;
  /** Open reservations. Populated by the service from allocations. */
  allocatedQuantity: number;
  /** Requested minus fulfilled. */
  remainingQuantity: number;
}

export interface CustomerPoStatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string | null;
  changedAt: string;
  reason: string | null;
  notes: string | null;
}

export interface CustomerPoDetail {
  id: string;
  poNumber: string;
  customerId: string;
  customerName: string;
  customerCode: string;
  poDate: string | null;
  receivedAt: string;
  requiredDeliveryDate: string | null;
  priority: CustomerPoPriority;
  status: CustomerPoStatus;
  source: CustomerPoSource;
  notes: string | null;
  actionRequired: boolean;
  actionRequiredReason: string | null;
  actionRequiredAt: string | null;
  items: CustomerPoItemRecord[];
  fulfillment: CustomerPoFulfillmentSummary;
  statusHistory: CustomerPoStatusHistoryItem[];
  audits: Array<{
    id: string;
    actorName: string;
    action: string;
    field: string | null;
    previousValue: string | null;
    newValue: string | null;
    timestamp: string;
  }>;
}

export interface CustomerPoListFilters {
  search?: string;
  status?: string;
  priority?: string;
  actionRequired?: boolean;
  dueSoonHours?: number;
}

export interface CustomerPoDashboardStats {
  pendingCustomerPos: number;
  actionRequired: number;
  urgent: number;
  dueSoon: number;
  /** Approved POs with nothing allocated yet. */
  awaitingAllocation: number;
  partiallyAllocated: number;
  readyForFulfillment: number;
  partiallyFulfilled: number;
}

export type { CustomerPoDbStatus, CustomerPoPriority, CustomerPoSource, CustomerStatus };
