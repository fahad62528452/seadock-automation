import { connection } from "next/server";
import { formatCount, formatKg, formatTimestamp } from "@/lib/format";
import { dashboardSnapshot } from "@/lib/mock/dashboard";
import { listAuditEntries } from "@/services/audit/audit-service";
import { getCustomerPoDashboardStats } from "@/services/customer-orders/customer-order-service";
import { getFulfillmentDashboardStats } from "@/services/fulfillment/fulfillment-service";
import { getEmailInboxDashboardStats } from "@/services/email/email-intake-service";
import { getInventorySummary } from "@/services/inventory/inventory-service";
import type { AuditEntry } from "@/types/audit";
import type {
  ActivityView,
  DashboardSummary,
  NotificationPreview,
  PendingAction,
  PendingActionView,
  StatusTone,
} from "@/types/dashboard";

const STATUS_LABELS: Record<PendingAction["status"], string> = {
  po_awaiting_verification: "PO Awaiting Verification",
  incoming_qaqc_pending: "Incoming QAQC Pending",
  processing_pending: "Processing Pending",
  final_qaqc_pending: "Final QAQC Pending",
  dispatch_pending: "Dispatch Pending",
};

const STATUS_TONES: Record<PendingAction["status"], StatusTone> = {
  po_awaiting_verification: "warning",
  incoming_qaqc_pending: "info",
  processing_pending: "neutral",
  final_qaqc_pending: "info",
  dispatch_pending: "warning",
};

function toPendingAction(action: PendingAction): PendingActionView {
  return {
    id: action.id,
    statusLabel: STATUS_LABELS[action.status],
    tone: STATUS_TONES[action.status],
    reference: action.reference,
    detail: action.detail,
    since: formatTimestamp(action.since),
    href: action.href,
  };
}

function toActivity(entry: AuditEntry): ActivityView {
  return {
    id: entry.id,
    time: formatTimestamp(entry.timestamp),
    user: entry.actorName,
    action: entry.action,
    record: entry.recordLabel,
  };
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await connection();
  const activity = await listAuditEntries({ limit: 5 });
  const snapshot = dashboardSnapshot;
  const customerPoStats = await getCustomerPoDashboardStats();
  const fulfillmentStats = await getFulfillmentDashboardStats();
  const emailInboxStats = await getEmailInboxDashboardStats();
  const inventorySummary = await getInventorySummary();

  return {
    cards: [
      {
        id: "pending-customer-pos",
        label: "Pending Customer POs",
        value: formatCount(customerPoStats.pendingCustomerPos),
        detail: "Open intake / review orders",
        href: "/customer-orders",
      },
      {
        id: "action-required-customer-pos",
        label: "Action Required",
        value: formatCount(customerPoStats.actionRequired),
        detail: "Customer POs needing attention",
        href: "/customer-orders?action=required",
      },
      {
        id: "urgent-customer-pos",
        label: "Urgent POs",
        value: formatCount(customerPoStats.urgent),
        detail: "Highest priority customer demand",
        href: "/customer-orders?priority=urgent",
      },
      {
        id: "due-soon-customer-pos",
        label: "Due in 48 Hours",
        value: formatCount(customerPoStats.dueSoon),
        detail: "Required delivery approaching",
        href: "/customer-orders?due=soon",
      },
      {
        id: "pos-awaiting-allocation",
        label: "POs Awaiting Allocation",
        value: formatCount(customerPoStats.awaitingAllocation),
        detail: "Approved, nothing reserved yet",
        href: "/customer-orders?status=approved",
      },
      {
        id: "pos-partially-allocated",
        label: "Partially Allocated",
        value: formatCount(customerPoStats.partiallyAllocated),
        detail: "Some stock reserved",
        href: "/customer-orders?status=partially_allocated",
      },
      {
        id: "pos-ready-for-fulfillment",
        label: "Ready for Fulfillment",
        value: formatCount(customerPoStats.readyForFulfillment),
        detail: "Fully allocated",
        href: "/customer-orders?status=ready_for_fulfillment",
      },
      {
        id: "fulfilments-awaiting-qaqc",
        label: "Awaiting Final QAQC",
        value: formatCount(fulfillmentStats.awaitingFinalQaqc),
        detail: "Fulfilments to inspect",
        href: "/customer-orders?status=ready_for_fulfillment",
      },
      {
        id: "fulfilments-ready-for-dispatch",
        label: "Ready for Dispatch",
        value: formatCount(fulfillmentStats.readyForDispatch),
        detail: "QAQC passed or conditional",
        href: "/customer-orders?status=ready_for_fulfillment",
      },
      {
        id: "pos-partially-fulfilled",
        label: "Partially Fulfilled",
        value: formatCount(customerPoStats.partiallyFulfilled),
        detail: "Dispatched in part",
        href: "/customer-orders?status=partially_fulfilled",
      },
      {
        id: "new-po-emails",
        label: "New PO Emails",
        value: formatCount(emailInboxStats.newPoEmails),
        detail: "Fresh email PO candidates",
        href: "/customer-orders/inbox",
      },
      {
        id: "pos-awaiting-review",
        label: "POs Awaiting Review",
        value: formatCount(emailInboxStats.awaitingReview),
        detail: "Email candidates in review queue",
        href: "/customer-orders/inbox",
      },
      {
        id: "email-action-required",
        label: "Email Action Required",
        value: formatCount(emailInboxStats.actionRequired),
        detail: "Email intake needing operator attention",
        href: "/customer-orders/inbox",
      },
      {
        id: "extraction-errors",
        label: "Extraction Errors",
        value: formatCount(emailInboxStats.extractionErrors),
        detail: "Failed email PO extractions",
        href: "/customer-orders/inbox",
      },
      {
        id: "pending-vendor-orders",
        label: "Pending Vendor Orders",
        value: formatCount(snapshot.pendingVendorOrders),
        detail: "Open purchase orders",
        href: "/purchases/orders",
      },
      {
        id: "available-inventory",
        label: "Available Inventory",
        value: formatKg(inventorySummary.availableQuantity),
        detail: "Total on hand minus reserved",
        href: "/inventory",
      },
      {
        id: "reserved-inventory",
        label: "Reserved Inventory",
        value: formatKg(inventorySummary.reservedQuantity),
        detail: "Allocated to customer POs",
        href: "/inventory",
      },
      {
        id: "fresh-inventory",
        label: "Fresh Inventory",
        value: formatKg(inventorySummary.freshQuantity),
        detail: "Raw and processed not yet frozen",
        href: "/inventory/fresh",
      },
      {
        id: "frozen-inventory",
        label: "Frozen Inventory",
        value: formatKg(inventorySummary.frozenQuantity),
        detail: "Frozen stock balances",
        href: "/inventory/frozen",
      },
      {
        id: "wastage-inventory",
        label: "Wastage Inventory",
        value: formatKg(inventorySummary.wastageQuantity),
        detail: "Recorded processing wastage",
        href: "/inventory/wastage",
      },
      {
        id: "processing-today",
        label: "Processing Today",
        value: formatCount(snapshot.processingRunsToday),
        detail: "Runs scheduled or in progress",
        href: "/processing",
      },
      {
        id: "awaiting-qaqc",
        label: "Items Awaiting QAQC",
        value: formatCount(snapshot.awaitingQaqc),
        detail: "Incoming and final checks",
        href: "/qaqc/incoming",
      },
    ],
    pendingActions: snapshot.pendingActions.map(toPendingAction),
    recentActivity: activity.map(toActivity),
  };
}

export async function getNotificationPreview(): Promise<NotificationPreview[]> {
  "use cache";

  return dashboardSnapshot.pendingActions.slice(0, 5).map((action) => ({
    id: action.id,
    title: STATUS_LABELS[action.status],
    detail: `${action.reference} · ${action.detail}`,
    href: action.href,
  }));
}
