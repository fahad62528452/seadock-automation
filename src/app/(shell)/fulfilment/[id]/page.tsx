import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelFulfilmentAction,
  dispatchFulfilmentAction,
  recordFinalQaqcAction,
} from "@/app/(shell)/customer-orders/fulfillment-actions";
import { Can } from "@/components/auth/can";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import {
  CancelFulfilmentForm,
  DispatchForm,
  FinalQaqcForm,
} from "@/components/customer-orders/fulfillment-forms";
import { Alert, PageActions, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { formatTimestamp } from "@/lib/format";
import { labelFulfilmentStatus, labelInventoryType } from "@/lib/fulfillment-labels";
import { PERMISSIONS } from "@/lib/permissions";
import { formatQuantity, labelQaqcResult } from "@/lib/procurement-labels";
import { toneForStatusLabel } from "@/lib/status-tones";
import { getFulfilmentWorkspace } from "@/services/fulfillment/fulfillment-service";

const DONE_MESSAGES: Record<string, string> = {
  qaqc: "Final QAQC recorded.",
  dispatched: "Dispatch recorded. Stock and reservation were reduced together.",
  "fulfilment-cancelled": "Fulfilment cancelled. Its allocations remain reserved.",
};

const thClass = "px-4 py-2 font-medium";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const workspace = await getFulfilmentWorkspace(id);
  return { title: workspace ? workspace.fulfilmentNumber : "Fulfilment" };
}

export default async function FulfilmentWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  await connection();
  const query = searchParams ? await searchParams : {};
  const workspace = await getFulfilmentWorkspace(id);
  if (!workspace) notFound();

  const doneKey = typeof query.done === "string" ? query.done : "";
  const returnTo = `/fulfilment/${id}`;
  const today = new Date().toISOString().slice(0, 10);
  const unit = workspace.items[0]?.unit ?? "kg";
  const qaqc = workspace.finalQaqc;
  const qaqcOpen = ["draft", "ready", "partially_dispatched"].includes(workspace.status);
  const blocked = !workspace.canDispatch && qaqcOpen;

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-[5] -mx-3 border-b border-border bg-background/95 px-3 py-2 backdrop-blur sm:-mx-5 sm:px-5">
        <PageActions
          description={`${workspace.customerCode} · ${workspace.customerName} · PO ${workspace.poNumber}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={toneForStatusLabel(labelFulfilmentStatus(workspace.status))}>
                {labelFulfilmentStatus(workspace.status)}
              </StatusBadge>
              <PriorityBadge priority={workspace.priority} />
              <Link
                href={`/customer-orders/${workspace.customerPoId}/fulfill`}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
              >
                PO fulfilment
              </Link>
              <Link
                href="/fulfilment"
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
              >
                Board
              </Link>
            </div>
          }
        />
      </div>

      {DONE_MESSAGES[doneKey] ? <Alert tone="success">{DONE_MESSAGES[doneKey]}</Alert> : null}

      <Panel>
        <dl className="grid gap-3 p-3 text-[13px] sm:grid-cols-2 sm:px-4 lg:grid-cols-4">
          <div>
            <dt className="text-[11px] text-ink-muted">Customer PO</dt>
            <dd className="mt-0.5 font-semibold">
              <Link href={`/customer-orders/${workspace.customerPoId}`} className="text-primary-text hover:underline">
                {workspace.poNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-muted">PO status</dt>
            <dd className="mt-0.5">
              <StatusBadge tone={toneForStatusLabel(labelCustomerPoStatus(workspace.poStatus))}>
                {labelCustomerPoStatus(workspace.poStatus)}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-muted">Fulfilment status</dt>
            <dd className="mt-0.5">
              <StatusBadge tone={toneForStatusLabel(labelFulfilmentStatus(workspace.status))}>
                {labelFulfilmentStatus(workspace.status)}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Priority</dt>
            <dd className="mt-1">
              <PriorityBadge priority={workspace.priority} />
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Required delivery</dt>
            <dd className="mt-1 font-semibold">{workspace.requiredDeliveryDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Planned dispatch</dt>
            <dd className="mt-1 font-semibold">{workspace.plannedDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Created</dt>
            <dd className="mt-1 font-semibold">
              {formatTimestamp(workspace.createdAt)}
              {workspace.createdByName ? ` · ${workspace.createdByName}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Quantity</dt>
            <dd className="mt-1 font-semibold">
              {formatQuantity(workspace.dispatchedQuantity, unit)} of {formatQuantity(workspace.totalQuantity, unit)}{" "}
              dispatched
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Fulfilment items">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
              <tr>
                <th className={thClass}>Product</th>
                <th className={thClass}>PO line</th>
                <th className={thClass}>Batch</th>
                <th className={thClass}>Inventory type</th>
                <th className={thClass}>Allocated</th>
                <th className={thClass}>Fulfilment qty</th>
                <th className={thClass}>Dispatched</th>
                <th className={thClass}>Remaining</th>
                <th className={thClass}>QAQC</th>
              </tr>
            </thead>
            <tbody>
              {workspace.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{item.productName}</td>
                  <td className="px-4 py-2">{item.lineNumber}</td>
                  <td className="px-4 py-2">
                    <Link href={`/inventory/batches/${item.batchId}`} className="text-primary-text hover:underline">
                      {item.batchNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{labelInventoryType(item.inventoryType)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.allocatedQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.quantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.dispatchedQuantity, item.unit)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(item.remainingQuantity, item.unit)}</td>
                  <td className="px-4 py-2">{item.qaqcResult ? labelQaqcResult(item.qaqcResult) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Traceability">
        <ul className="space-y-3 p-4 text-[13px] text-ink">
          {workspace.traceability.map((link) => (
            <li key={`${link.batchId}-${link.inventoryItemId}`} className="rounded-md border border-border p-3">
              <p className="font-semibold">
                <Link href={`/inventory/batches/${link.batchId}`} className="text-primary-text hover:underline">
                  {link.batchNumber}
                </Link>{" "}
                · {labelInventoryType(link.inventoryType)}
              </p>
              <p className="mt-1 text-ink-muted">
                {link.vendorId ? (
                  <Link href={`/purchases/vendors/${link.vendorId}`} className="text-primary-text hover:underline">
                    {link.vendorName}
                  </Link>
                ) : (
                  link.vendorName || "Vendor"
                )}{" "}
                →{" "}
                {link.goodsReceiptId ? (
                  <Link
                    href={`/purchases/goods-received/${link.goodsReceiptId}`}
                    className="text-primary-text hover:underline"
                  >
                    {link.receiptNumber}
                  </Link>
                ) : (
                  link.receiptNumber || "Receipt"
                )}{" "}
                → batch →{" "}
                {link.processingRunId ? (
                  <Link href={`/processing/${link.processingRunId}`} className="text-primary-text hover:underline">
                    {link.processingRunNumber ?? link.processingRunId}
                  </Link>
                ) : (
                  "Processing"
                )}{" "}
                → customer dispatch
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      {qaqcOpen ? (
        <Can permission={PERMISSIONS.customerOrdersQaqc}>
          <Panel title={qaqc ? "Update final QAQC" : "Record final QAQC"}>
            <FinalQaqcForm
              action={recordFinalQaqcAction.bind(null, workspace.customerPoId, workspace.id)}
              defaultDate={qaqc?.inspectionDate ?? today}
              defaultQuantity={qaqc?.quantityChecked ?? workspace.totalQuantity}
              currentResult={qaqc?.result ?? null}
              returnTo={returnTo}
            />
          </Panel>
        </Can>
      ) : null}

      {blocked ? (
        <Alert tone="error">
          Dispatch is blocked until final QAQC is passed or conditional
          {qaqc?.result === "failed" ? " (the last result was Failed)." : "."}
        </Alert>
      ) : null}

      {workspace.canDispatch ? (
        <Can
          permission={PERMISSIONS.customerOrdersDispatch}
          fallback={<p className="text-[13px] text-ink-muted">You do not have permission to dispatch.</p>}
        >
          <Panel title="Dispatch">
            <DispatchForm
              action={dispatchFulfilmentAction.bind(null, workspace.customerPoId, workspace.id)}
              items={workspace.items}
              defaultVehicle={workspace.vehicleNumber ?? ""}
              defaultDriver={workspace.driverName ?? ""}
              returnTo={returnTo}
            />
          </Panel>
        </Can>
      ) : null}

      {["draft", "ready"].includes(workspace.status) ? (
        <Can permission={PERMISSIONS.customerOrdersFulfill}>
          <Panel title="Cancel fulfilment">
            <CancelFulfilmentForm
              action={cancelFulfilmentAction.bind(null, workspace.customerPoId, workspace.id)}
              returnTo={returnTo}
            />
          </Panel>
        </Can>
      ) : null}
    </div>
  );
}
