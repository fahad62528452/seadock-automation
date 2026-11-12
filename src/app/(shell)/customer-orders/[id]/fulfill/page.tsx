import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  allocateInventoryAction,
  cancelFulfilmentAction,
  createFulfilmentAction,
  dispatchFulfilmentAction,
  recordFinalQaqcAction,
  releaseAllocationAction,
} from "@/app/(shell)/customer-orders/fulfillment-actions";
import { Can } from "@/components/auth/can";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import {
  AllocationForm,
  CancelFulfilmentForm,
  CreateFulfilmentForm,
  DispatchForm,
  FinalQaqcForm,
  ReleaseAllocationForm,
} from "@/components/customer-orders/fulfillment-forms";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { formatTimestamp } from "@/lib/format";
import {
  labelAllocationStatus,
  labelFulfilmentStatus,
  labelInventoryType,
} from "@/lib/fulfillment-labels";
import { PERMISSIONS } from "@/lib/permissions";
import { formatQuantity, labelQaqcResult } from "@/lib/procurement-labels";
import { getCustomerPurchaseOrder } from "@/services/customer-orders/customer-order-service";
import {
  getAvailableInventoryForCustomerOrder,
  getCustomerPoFulfillmentDetail,
} from "@/services/fulfillment/fulfillment-service";

export const metadata: Metadata = {
  title: "Fulfil Customer PO",
};

const DONE_MESSAGES: Record<string, string> = {
  allocated: "Inventory allocated and reserved. Stock on hand is unchanged until dispatch.",
  released: "Allocation released. The reserved quantity is available again.",
  fulfilment: "Fulfilment created from the selected allocations.",
  "fulfilment-cancelled": "Fulfilment cancelled. Its allocations remain reserved.",
  qaqc: "Final QAQC recorded.",
  dispatched: "Dispatch recorded. Stock and reservation were reduced together.",
};

const ALLOCATABLE = ["approved", "partially_allocated", "ready_for_fulfillment", "partially_fulfilled"];
const thClass = "px-4 py-2 font-medium";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-ink">{value}</dd>
    </div>
  );
}

export default async function FulfillCustomerPoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Time-dependent values (fresh window, today) must render at request time.
  await connection();
  const query = searchParams ? await searchParams : {};
  const [po, fulfillment, availability] = await Promise.all([
    getCustomerPurchaseOrder(id),
    getCustomerPoFulfillmentDetail(id),
    getAvailableInventoryForCustomerOrder(id),
  ]);
  if (!po || !fulfillment || !availability) notFound();

  const doneKey = typeof query.done === "string" ? query.done : "";
  const canAllocate = ALLOCATABLE.includes(po.status);
  const today = new Date().toISOString().slice(0, 10);
  const unit = po.items[0]?.unit ?? "kg";
  const totals = fulfillment.totals;

  const unattached = fulfillment.allocations.filter(
    (row) => row.status === "active" && !row.fulfilmentId && row.fulfilledQuantity === 0,
  );
  const openFulfilments = fulfillment.fulfilments.filter((row) => row.status !== "cancelled");
  const closedFulfilments = fulfillment.fulfilments.filter((row) => row.status === "cancelled");

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Fulfil ${po.poNumber}`}
        description="Allocate stock, build a fulfilment, record final QAQC, then dispatch."
        actions={
          <Link
            href={`/customer-orders/${po.id}`}
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            Back to PO
          </Link>
        }
      />

      {DONE_MESSAGES[doneKey] ? <Alert tone="success">{DONE_MESSAGES[doneKey]}</Alert> : null}
      {po.status === "cancelled" ? <Alert tone="error">This purchase order is cancelled.</Alert> : null}
      {!canAllocate && !["cancelled", "fulfilled"].includes(po.status) ? (
        <Alert tone="info">
          Inventory can be allocated once the PO is approved. Current status: {labelCustomerPoStatus(po.status)}.
        </Alert>
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <p className="text-[12px] tracking-wide text-ink-muted uppercase">Customer</p>
            <p className="mt-1 text-[15px] font-semibold text-ink">
              {po.customerCode} · {po.customerName}
            </p>
            <p className="mt-1 text-[12px] text-ink-muted">
              Required {po.requiredDeliveryDate ?? "—"} · Received {formatTimestamp(po.receivedAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={po.priority} />
            <StatusBadge>{labelCustomerPoStatus(po.status)}</StatusBadge>
          </div>
        </div>
        <dl className="grid gap-4 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Requested" value={formatQuantity(totals.requestedQuantity, unit)} />
          <Stat label="Reserved (open)" value={formatQuantity(totals.allocatedQuantity, unit)} />
          <Stat label="Fulfilled" value={formatQuantity(totals.fulfilledQuantity, unit)} />
          <Stat label="Remaining" value={formatQuantity(totals.remainingQuantity, unit)} />
          <Stat label="Unallocated" value={formatQuantity(totals.unallocatedQuantity, unit)} />
        </dl>
      </Panel>

      <Panel title="Items" description="Remaining is requested minus fulfilled. Allocation alone never fulfils an order.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>Product</th>
                <th className={thClass}>Requested</th>
                <th className={thClass}>Reserved</th>
                <th className={thClass}>Fulfilled</th>
                <th className={thClass}>Remaining</th>
                <th className={thClass}>Unallocated</th>
              </tr>
            </thead>
            <tbody>
              {fulfillment.items.map((item) => (
                <tr key={item.customerPoItemId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{item.lineNumber}</td>
                  <td className="px-4 py-2 font-medium">{item.productName}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.requestedQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.allocatedQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.fulfilledQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.unallocatedQuantity, item.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {canAllocate
        ? availability.items
            .filter((item) => item.unallocatedQuantity > 0)
            .map((item) => (
              <Panel
                key={item.customerPoItemId}
                title={`Allocate inventory · ${item.productName}`}
                description={`${formatQuantity(item.unallocatedQuantity, item.unit)} still needs stock. Processed and frozen inventory only; wastage is never allocated.`}
              >
                <Can
                  permission={PERMISSIONS.customerOrdersAllocate}
                  fallback={<p className="p-4 text-[13px] text-ink-muted">You do not have permission to allocate inventory.</p>}
                >
                  {item.options.length ? (
                    <AllocationForm
                      action={allocateInventoryAction.bind(null, po.id, item.customerPoItemId)}
                      options={item.options}
                      unallocatedQuantity={item.unallocatedQuantity}
                      unit={item.unit}
                    />
                  ) : (
                    <p className="p-4 text-[13px] text-ink-muted">
                      No available processed or frozen inventory matches {item.productName} right now.
                    </p>
                  )}
                </Can>
              </Panel>
            ))
        : null}

      <Panel title="Allocations" description="Reservations against this PO. Stock quantity only drops when a fulfilment is dispatched.">
        {fulfillment.allocations.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Batch</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Allocated</th>
                  <th className={thClass}>Dispatched</th>
                  <th className={thClass}>Still reserved</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Fulfilment</th>
                  <th className={thClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {fulfillment.allocations.map((allocation) => (
                  <tr key={allocation.id} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2">
                      {allocation.lineNumber}. {allocation.productName}
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/inventory/batches/${allocation.batchId}`} className="text-primary-text hover:underline">
                        {allocation.batchNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{labelInventoryType(allocation.inventoryType)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(allocation.allocatedQuantity, allocation.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(allocation.fulfilledQuantity, allocation.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(allocation.reservedQuantity, allocation.unit)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge>{labelAllocationStatus(allocation.status)}</StatusBadge>
                      {allocation.releaseReason ? (
                        <div className="mt-1 text-[12px] text-ink-muted">{allocation.releaseReason}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">{allocation.fulfilmentNumber ?? "—"}</td>
                    <td className="px-4 py-2">
                      {allocation.status === "active" && !allocation.fulfilmentId && allocation.fulfilledQuantity === 0 ? (
                        <Can permission={PERMISSIONS.customerOrdersAllocate}>
                          <ReleaseAllocationForm action={releaseAllocationAction.bind(null, po.id, allocation.id)} />
                        </Can>
                      ) : allocation.status === "active" && allocation.fulfilmentId ? (
                        <span className="text-[12px] text-ink-muted">Attached to fulfilment</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No inventory allocated yet.</p>
        )}
      </Panel>

      <Panel title="Create fulfilment" description="Group reserved allocations into a dispatchable fulfilment.">
        <Can
          permission={PERMISSIONS.customerOrdersFulfill}
          fallback={<p className="p-4 text-[13px] text-ink-muted">You do not have permission to create fulfilments.</p>}
        >
          {unattached.length ? (
            <CreateFulfilmentForm action={createFulfilmentAction.bind(null, po.id)} allocations={unattached} />
          ) : (
            <p className="p-4 text-[13px] text-ink-muted">
              No active allocations are waiting for a fulfilment. Allocate inventory first.
            </p>
          )}
        </Can>
      </Panel>

      {openFulfilments.map((fulfilment) => {
        const qaqc = fulfilment.finalQaqc;
        const qaqcOpen = ["draft", "ready", "partially_dispatched"].includes(fulfilment.status);
        const blocked = !fulfilment.canDispatch && qaqcOpen;
        return (
          <Panel
            key={fulfilment.id}
            title={`${fulfilment.fulfilmentNumber} · ${labelFulfilmentStatus(fulfilment.status)}`}
            description={`Planned ${fulfilment.plannedDate ?? "—"} · ${formatQuantity(fulfilment.dispatchedQuantity, unit)} of ${formatQuantity(fulfilment.totalQuantity, unit)} dispatched`}
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                  <tr>
                    <th className={thClass}>Item</th>
                    <th className={thClass}>Batch</th>
                    <th className={thClass}>Quantity</th>
                    <th className={thClass}>Dispatched</th>
                    <th className={thClass}>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {fulfilment.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        {item.lineNumber}. {item.productName}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/inventory/batches/${item.batchId}`} className="text-primary-text hover:underline">
                          {item.batchNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.quantity, item.unit)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.dispatchedQuantity, item.unit)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border px-4 py-3 text-[13px]">
              <span className="text-ink-muted">Final QAQC: </span>
              {qaqc ? (
                <span>
                  <StatusBadge>{labelQaqcResult(qaqc.result)}</StatusBadge>{" "}
                  <span className="text-ink-muted">
                    {qaqc.inspectionDate}
                    {qaqc.quantityChecked != null ? ` · ${formatQuantity(qaqc.quantityChecked, unit)} checked` : ""}
                    {qaqc.inspectorName ? ` · ${qaqc.inspectorName}` : ""}
                    {qaqc.notes ? ` · ${qaqc.notes}` : ""}
                  </span>
                </span>
              ) : (
                <span>Not recorded</span>
              )}
              {fulfilment.vehicleNumber ? (
                <p className="mt-1 text-ink-muted">
                  Vehicle {fulfilment.vehicleNumber} · Driver {fulfilment.driverName ?? "—"}
                  {fulfilment.dispatchedAt ? ` · First dispatch ${formatTimestamp(fulfilment.dispatchedAt)}` : ""}
                </p>
              ) : null}
            </div>

            {qaqcOpen ? (
              <Can permission={PERMISSIONS.customerOrdersQaqc}>
                <div className="border-t border-border">
                  <h3 className="px-4 pt-3 text-[13px] font-semibold text-ink">
                    {qaqc ? "Update final QAQC" : "Record final QAQC"}
                  </h3>
                  <FinalQaqcForm
                    action={recordFinalQaqcAction.bind(null, po.id, fulfilment.id)}
                    defaultDate={qaqc?.inspectionDate ?? today}
                    defaultQuantity={qaqc?.quantityChecked ?? fulfilment.totalQuantity}
                    currentResult={qaqc?.result ?? null}
                  />
                </div>
              </Can>
            ) : null}

            {blocked ? (
              <div className="border-t border-border p-4">
                <Alert tone="error">
                  Dispatch is blocked until final QAQC is passed or conditional
                  {qaqc?.result === "failed" ? " (the last result was Failed)." : "."}
                </Alert>
              </div>
            ) : null}

            {fulfilment.canDispatch ? (
              <Can
                permission={PERMISSIONS.customerOrdersDispatch}
                fallback={<p className="border-t border-border p-4 text-[13px] text-ink-muted">You do not have permission to dispatch.</p>}
              >
                <div className="border-t border-border">
                  <h3 className="px-4 pt-3 text-[13px] font-semibold text-ink">Dispatch</h3>
                  <DispatchForm
                    action={dispatchFulfilmentAction.bind(null, po.id, fulfilment.id)}
                    items={fulfilment.items}
                    defaultVehicle={fulfilment.vehicleNumber ?? ""}
                    defaultDriver={fulfilment.driverName ?? ""}
                  />
                </div>
              </Can>
            ) : null}

            {["draft", "ready"].includes(fulfilment.status) ? (
              <Can permission={PERMISSIONS.customerOrdersFulfill}>
                <div className="border-t border-border">
                  <CancelFulfilmentForm action={cancelFulfilmentAction.bind(null, po.id, fulfilment.id)} />
                </div>
              </Can>
            ) : null}
          </Panel>
        );
      })}

      {closedFulfilments.length ? (
        <Panel title="Cancelled fulfilments">
          <ul className="space-y-1 p-4 text-[13px] text-ink-muted">
            {closedFulfilments.map((fulfilment) => (
              <li key={fulfilment.id}>
                {fulfilment.fulfilmentNumber} · created {formatTimestamp(fulfilment.createdAt)}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
