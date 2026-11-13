import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  changeCustomerPoStatusAction,
  updateCustomerPoPriorityAction,
} from "@/app/(shell)/customer-orders/actions";
import { Can } from "@/components/auth/can";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import { CustomerPoStatusForm } from "@/components/customer-orders/customer-po-status-form";
import { CustomerPoStatusWorkflow } from "@/components/customer-orders/status-workflow";
import { Alert, PageActions, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { formatQuantity } from "@/lib/procurement-labels";
import { formatTimestamp } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { labelAllocationStatus, labelFulfilmentStatus } from "@/lib/fulfillment-labels";
import { labelQaqcResult } from "@/lib/procurement-labels";
import { toneForStatusLabel } from "@/lib/status-tones";
import { getCustomerPurchaseOrder } from "@/services/customer-orders/customer-order-service";
import { getCustomerPoFulfillmentDetail } from "@/services/fulfillment/fulfillment-service";

export const metadata: Metadata = {
  title: "Customer PO",
};

export default async function CustomerPoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const [po, fulfillment] = await Promise.all([
    getCustomerPurchaseOrder(id),
    getCustomerPoFulfillmentDetail(id),
  ]);
  if (!po) notFound();
  const canFulfil = !["received", "under_review", "action_required", "cancelled"].includes(po.status);
  const activeFulfilments = fulfillment?.fulfilments.filter((row) => row.status !== "cancelled") ?? [];

  const changeStatus = changeCustomerPoStatusAction.bind(null, po.id);
  const changePriority = updateCustomerPoPriorityAction.bind(null, po.id);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-[5] -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <PageActions
          description={`${po.customerCode ? `${po.customerCode} · ` : ""}${po.customerName}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge priority={po.priority} />
              <StatusBadge tone={toneForStatusLabel(labelCustomerPoStatus(po.status))}>
                {labelCustomerPoStatus(po.status)}
              </StatusBadge>
              {canFulfil ? (
                <Link
                  href={`/customer-orders/${po.id}/fulfill`}
                  className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
                >
                  {po.status === "fulfilled" ? "View Fulfilment" : "Allocate / Fulfil"}
                </Link>
              ) : null}
            </div>
          }
        />
      </div>

      {query.created ? <Alert tone="success">Customer purchase order created successfully.</Alert> : null}
      {query.status ? <Alert tone="success">Customer PO status updated.</Alert> : null}
      {query.updated ? <Alert tone="success">Customer PO updated.</Alert> : null}
      {query.cancelled ? (
        <Alert tone="success">Customer PO cancelled. Reserved inventory was released.</Alert>
      ) : null}
      {po.actionRequired ? (
        <Alert tone="error">
          Action required{po.actionRequiredReason ? `: ${po.actionRequiredReason}` : "."}
        </Alert>
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
          <div>
            <p className="text-[11px] tracking-wide text-ink-muted uppercase">Customer</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">
              {po.customerId ? (
                <Link href={`/customers/${po.customerId}`} className="text-primary-text hover:underline">
                  {po.customerCode} · {po.customerName}
                </Link>
              ) : (
                po.customerName
              )}
            </p>
          </div>
        </div>
        <dl className="grid gap-3 p-3 text-[13px] sm:grid-cols-2 sm:px-4 lg:grid-cols-4">
          <div>
            <dt className="text-[12px] text-ink-muted">PO Number</dt>
            <dd className="mt-1 font-medium">{po.poNumber}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Received At</dt>
            <dd className="mt-1">{formatTimestamp(po.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Required Delivery</dt>
            <dd className="mt-1">{po.requiredDeliveryDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Source</dt>
            <dd className="mt-1 capitalize">{po.source}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">PO Date</dt>
            <dd className="mt-1">{po.poDate ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-ink-muted">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{po.notes || "—"}</dd>
          </div>
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="PO Items">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Requested</th>
                  <th className="px-4 py-2 font-medium">Reserved</th>
                  <th className="px-4 py-2 font-medium">Fulfilled</th>
                  <th className="px-4 py-2 font-medium">Remaining</th>
                  <th className="px-4 py-2 font-medium">Required</th>
                  <th className="px-4 py-2 font-medium">Specs</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{item.lineNumber}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-[12px] text-ink-muted">{item.species}</div>
                    </td>
                    <td className="px-4 py-2">{item.productCode || "—"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.quantity, item.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.allocatedQuantity, item.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.fulfilledQuantity, item.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{item.requiredDeliveryDate || "—"}</td>
                    <td className="px-4 py-2">{item.specifications || item.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Operational status">
          <CustomerPoStatusWorkflow status={po.status} />
        </Panel>
      </div>

      <Panel
        title="Allocation and fulfilment"
        description="Requested, reserved, and fulfilled quantities. Remaining is requested minus fulfilled."
      >
        <dl className="grid gap-4 p-4 text-[13px] sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-[12px] text-ink-muted">Requested</dt>
            <dd className="mt-1 font-semibold">{formatQuantity(po.fulfillment.requestedQuantity)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Reserved</dt>
            <dd className="mt-1 font-semibold">{formatQuantity(po.fulfillment.allocatedQuantity)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Fulfilled</dt>
            <dd className="mt-1 font-semibold">{formatQuantity(po.fulfillment.fulfilledQuantity)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Remaining</dt>
            <dd className="mt-1 font-semibold">{formatQuantity(po.fulfillment.remainingQuantity)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Unallocated</dt>
            <dd className="mt-1 font-semibold">{formatQuantity(po.fulfillment.unallocatedQuantity)}</dd>
          </div>
        </dl>
        {fulfillment?.allocations.length ? (
          <div className="overflow-x-auto border-t border-border">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Batch</th>
                  <th className="px-4 py-2 font-medium">Allocated</th>
                  <th className="px-4 py-2 font-medium">Dispatched</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Fulfilment</th>
                </tr>
              </thead>
              <tbody>
                {fulfillment.allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      {allocation.lineNumber}. {allocation.productName}
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/inventory/batches/${allocation.batchId}`} className="text-primary-text hover:underline">
                        {allocation.batchNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(allocation.allocatedQuantity, allocation.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(allocation.fulfilledQuantity, allocation.unit)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={toneForStatusLabel(labelAllocationStatus(allocation.status))}>
                        {labelAllocationStatus(allocation.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2">{allocation.fulfilmentNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-border p-4 text-[13px] text-ink-muted">No inventory allocated yet.</p>
        )}
      </Panel>

      <Panel title="Fulfilments, final QAQC, and dispatch">
        {activeFulfilments.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Fulfilment</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Final QAQC</th>
                  <th className="px-4 py-2 font-medium">Dispatched</th>
                  <th className="px-4 py-2 font-medium">Vehicle / Driver</th>
                  <th className="px-4 py-2 font-medium">Dispatched At</th>
                </tr>
              </thead>
              <tbody>
                {activeFulfilments.map((fulfilment) => (
                  <tr key={fulfilment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{fulfilment.fulfilmentNumber}</td>
                    <td className="px-4 py-2">
                      <StatusBadge tone={toneForStatusLabel(labelFulfilmentStatus(fulfilment.status))}>
                        {labelFulfilmentStatus(fulfilment.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2">{labelQaqcResult(fulfilment.finalQaqc?.result ?? null)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatQuantity(fulfilment.dispatchedQuantity)} of {formatQuantity(fulfilment.totalQuantity)}
                    </td>
                    <td className="px-4 py-2">
                      {fulfilment.vehicleNumber ? `${fulfilment.vehicleNumber} · ${fulfilment.driverName ?? "—"}` : "—"}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {fulfilment.dispatchedAt ? formatTimestamp(fulfilment.dispatchedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No fulfilments yet.</p>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Can permission={PERMISSIONS.customerOrdersStatus}>
          <Panel
            title="Change status"
            description="Cancelling a PO releases every active inventory reservation."
          >
            <CustomerPoStatusForm action={changeStatus} currentStatus={po.status} />
          </Panel>
        </Can>
        <Can permission={PERMISSIONS.customerOrdersManage}>
          <Panel title="Update priority">
            <form action={changePriority} className="flex flex-wrap items-end gap-3 p-4">
              <label className="text-[12px] font-medium text-ink">
                Priority
                <select
                  name="priority"
                  defaultValue={po.priority}
                  className="mt-1 block h-9 rounded-md border border-border bg-surface px-3 text-[13px]"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
              >
                Save Priority
              </button>
            </form>
          </Panel>
        </Can>
      </div>

      <Panel title="Status history">
        {po.statusHistory.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">By</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {po.statusHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTimestamp(entry.changedAt)}</td>
                    <td className="px-4 py-2">{entry.fromStatus ? labelCustomerPoStatus(entry.fromStatus) : "—"}</td>
                    <td className="px-4 py-2">{labelCustomerPoStatus(entry.toStatus)}</td>
                    <td className="px-4 py-2">{entry.changedByName ?? "—"}</td>
                    <td className="px-4 py-2">{entry.reason || entry.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No status history yet.</p>
        )}
      </Panel>

      <Panel title="Audit / history">
        {po.audits.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Field</th>
                  <th className="px-4 py-2 font-medium">Previous</th>
                  <th className="px-4 py-2 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {po.audits.map((audit) => (
                  <tr key={audit.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTimestamp(audit.timestamp)}</td>
                    <td className="px-4 py-2">{audit.actorName}</td>
                    <td className="px-4 py-2">{audit.action}</td>
                    <td className="px-4 py-2">{audit.field ?? "—"}</td>
                    <td className="px-4 py-2">{audit.previousValue ?? "—"}</td>
                    <td className="px-4 py-2">{audit.newValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No audit entries for this PO yet.</p>
        )}
      </Panel>
    </div>
  );
}
