import type { PendingAction } from "@/types/dashboard";

/**
 * Sample operational snapshot used when live customer-PO stats are unavailable
 * or when presenting non-customer-PO dashboard figures in mock mode.
 */
export const dashboardSnapshot = {
  pendingCustomerPos: 8,
  actionRequiredCustomerPos: 3,
  urgentCustomerPos: 2,
  dueSoonCustomerPos: 4,
  pendingVendorOrders: 4,
  freshInventoryKg: 18450,
  frozenInventoryKg: 42180,
  processingRunsToday: 3,
  awaitingQaqc: 7,
  pendingActions: [
    {
      id: "action_cpo_urgent",
      status: "po_awaiting_verification",
      reference: "PO-1001",
      detail: "URGENT · Example Seafood Buyer · review required",
      since: "2026-11-12T08:20:00.000Z",
      href: "/customer-orders?priority=urgent",
    },
    {
      id: "action_cpo_action",
      status: "po_awaiting_verification",
      reference: "PO-1004",
      detail: "Action required · missing delivery date",
      since: "2026-11-12T07:05:00.000Z",
      href: "/customer-orders?action=required",
    },
    {
      id: "action_gr_231",
      status: "incoming_qaqc_pending",
      reference: "GR-231",
      detail: "Batch BATCH-2026-00014 · Indian mackerel",
      since: "2026-11-11T07:05:00.000Z",
      href: "/qaqc/incoming",
    },
    {
      id: "action_batch_0142",
      status: "processing_pending",
      reference: "BATCH-2026-00012",
      detail: "Fresh prawns · 4,950 kg",
      since: "2026-11-10T14:30:00.000Z",
      href: "/processing",
    },
    {
      id: "action_cpo_due",
      status: "po_awaiting_verification",
      reference: "PO-1008",
      detail: "Due within 48 hours · under review",
      since: "2026-11-10T11:10:00.000Z",
      href: "/customer-orders?due=soon",
    },
  ] satisfies PendingAction[],
};
