import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { freshWindowLabel } from "@/lib/fresh-window";
import { formatQuantity, labelProcessingStatus, labelQaqcResult } from "@/lib/procurement-labels";
import { labelAllocationStatus, labelInventoryType } from "@/lib/fulfillment-labels";
import { InventoryMovementsTable } from "@/components/inventory/inventory-movements-table";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { formatKg } from "@/lib/format";
import { getBatchFulfillmentUsage } from "@/services/fulfillment/fulfillment-service";
import {
  getBatchInventorySummary,
  listInventory,
  listInventoryMovements,
} from "@/services/inventory/inventory-service";
import { getBatch } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Batch",
};

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Time-dependent values (fresh window, today) must render at request time.
  await connection();
  const batch = await getBatch(id);
  if (!batch) notFound();
  const [usage, batchInventory, inventoryItems, movements] = await Promise.all([
    getBatchFulfillmentUsage(batch.id),
    getBatchInventorySummary(batch.id),
    listInventory({ batchId: batch.id }),
    listInventoryMovements({ batchId: batch.id, limit: 100 }),
  ]);
  const hasSellable = usage.inventoryItems.length > 0 || usage.allocations.length > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={batch.batchNumber}
        description="Parent batch identity for receiving, inventory, and processing."
        actions={
          <Link
            href={`/processing/new?batch=${batch.id}`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
          >
            Process Batch
          </Link>
        }
      />

      <Panel>
        <div className="border-b border-border px-4 py-5">
          <p className="text-[12px] font-medium tracking-wide text-ink-muted uppercase">Batch Number</p>
          <p className="mt-1 text-[28px] font-semibold tracking-tight text-ink">{batch.batchNumber}</p>
        </div>
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[12px] text-ink-muted">Vendor</dt>
            <dd className="mt-1 text-[13px]">
              {batch.vendorId ? (
                <Link href={`/purchases/vendors/${batch.vendorId}`} className="text-primary-text hover:underline">
                  {batch.vendorCode} · {batch.vendorName}
                </Link>
              ) : (
                batch.vendorName
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Goods Receipt</dt>
            <dd className="mt-1 text-[13px]">
              <Link href={`/purchases/goods-received/${batch.goodsReceiptId}`} className="text-primary-text hover:underline">
                {batch.receiptNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Product / Species</dt>
            <dd className="mt-1 text-[13px]">{batch.productSpecies}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Received Quantity</dt>
            <dd className="mt-1 text-[13px]">{formatQuantity(batch.receivedQuantity, batch.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Current Quantity</dt>
            <dd className="mt-1 text-[13px]">{formatQuantity(batch.remainingQuantity, batch.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge>{batch.status}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Received At</dt>
            <dd className="mt-1 text-[13px]">{formatTimestamp(batch.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Fresh Until</dt>
            <dd className="mt-1 text-[13px]">{formatTimestamp(batch.freshUntil)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Current Fresh Status</dt>
            <dd className="mt-1">
              <StatusBadge>{freshWindowLabel(batch.freshStatus)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Incoming QAQC</dt>
            <dd className="mt-1 text-[13px]">{labelQaqcResult(batch.qaqcResult)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Initial Inventory</dt>
            <dd className="mt-1 text-[13px]">
              {batch.inventoryQuantity != null
                ? `${formatQuantity(batch.inventoryQuantity, batch.unit)} · ${batch.inventoryType ?? "raw"}`
                : "—"}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Traceability">
        <ol className="space-y-2 p-4 text-[13px] text-ink">
          <li>
            Vendor →{" "}
            {batch.vendorId ? (
              <Link href={`/purchases/vendors/${batch.vendorId}`} className="text-primary-text hover:underline">
                {batch.vendorName}
              </Link>
            ) : (
              batch.vendorName
            )}
          </li>
          <li>
            Purchase Order →{" "}
            {batch.purchaseOrderId ? (
              <Link href={`/purchases/orders/${batch.purchaseOrderId}`} className="text-primary-text hover:underline">
                {batch.poNumber}
              </Link>
            ) : (
              batch.poNumber || "—"
            )}
          </li>
          <li>
            Goods Receipt →{" "}
            <Link href={`/purchases/goods-received/${batch.goodsReceiptId}`} className="text-primary-text hover:underline">
              {batch.receiptNumber}
            </Link>
          </li>
          <li>Incoming QAQC → {labelQaqcResult(batch.qaqcResult)}</li>
          <li className="font-semibold">Parent Batch → {batch.batchNumber}</li>
          <li>Processing Runs → {batch.processingRuns.length ? `${batch.processingRuns.length} recorded` : "None yet"}</li>
          <li>
            Customer Allocations →{" "}
            {usage.allocations.length ? `${usage.allocations.length} recorded` : "None yet"}
          </li>
        </ol>
      </Panel>

      {batchInventory ? (
        <Panel
          title="Inventory balances"
          description="Centralised balances for this parent batch across raw, processed, wastage, fresh, frozen, reserved, and available stock."
        >
          <dl className="grid gap-4 border-b border-border p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[12px] text-ink-muted">Total</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.totalQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Available</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.availableQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Reserved</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.reservedQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Fulfilled (dispatch)</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.fulfilledQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Raw</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.rawQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Processed</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.processedQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Fresh (lifecycle)</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.freshQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Frozen</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.frozenQuantity)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Wastage</dt>
              <dd className="mt-1 font-semibold">{formatKg(batchInventory.totals.wastageQuantity)}</dd>
            </div>
          </dl>
          {inventoryItems.length ? (
            <InventoryTable
              rows={inventoryItems.filter((row) => row.quantity > 0)}
              emptyTitle="No inventory items for this batch."
              emptyDescription="Receiving and processing create inventory rows against the parent batch."
            />
          ) : (
            <p className="p-4 text-[13px] text-ink-muted">No inventory items recorded for this batch yet.</p>
          )}
          {movements.length ? (
            <div className="border-t border-border">
              <p className="px-4 pt-4 text-[13px] font-semibold text-ink">Movement history</p>
              <InventoryMovementsTable
                rows={movements}
                emptyTitle="No movements"
                emptyDescription="Inventory movements will appear here."
              />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {hasSellable ? (
        <Panel
          title="Customer allocation and fulfilment usage"
          description="Sellable stock only (processed and frozen). Total is on hand, Available is Total minus Reserved."
        >
          <dl className="grid gap-4 p-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[12px] text-ink-muted">Total on hand</dt>
              <dd className="mt-1 font-semibold">{formatQuantity(usage.totalQuantity, usage.unit)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Reserved</dt>
              <dd className="mt-1 font-semibold">{formatQuantity(usage.reservedQuantity, usage.unit)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Available</dt>
              <dd className="mt-1 font-semibold">{formatQuantity(usage.availableQuantity, usage.unit)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Dispatched to customers</dt>
              <dd className="mt-1 font-semibold">{formatQuantity(usage.dispatchedQuantity, usage.unit)}</dd>
            </div>
          </dl>
          {usage.inventoryItems.length ? (
            <div className="overflow-x-auto border-t border-border">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Inventory</th>
                    <th className="px-4 py-2 font-medium">Total</th>
                    <th className="px-4 py-2 font-medium">Reserved</th>
                    <th className="px-4 py-2 font-medium">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.inventoryItems.map((row) => (
                    <tr key={row.inventoryItemId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{labelInventoryType(row.inventoryType)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(row.totalQuantity, row.unit)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(row.reservedQuantity, row.unit)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(row.availableQuantity, row.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {usage.allocations.length ? (
            <div className="overflow-x-auto border-t border-border">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Customer PO</th>
                    <th className="px-4 py-2 font-medium">Customer</th>
                    <th className="px-4 py-2 font-medium">Allocated</th>
                    <th className="px-4 py-2 font-medium">Dispatched</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Fulfilment</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.allocations.map((row) => (
                    <tr key={row.allocationId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <Link href={`/customer-orders/${row.customerPoId}`} className="text-primary-text hover:underline">
                          {row.poNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{row.customerName}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(row.allocatedQuantity, row.unit)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(row.fulfilledQuantity, row.unit)}</td>
                      <td className="px-4 py-2">
                        <StatusBadge>{labelAllocationStatus(row.status)}</StatusBadge>
                      </td>
                      <td className="px-4 py-2">{row.fulfilmentNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="border-t border-border p-4 text-[13px] text-ink-muted">
              No customer allocations against this batch yet.
            </p>
          )}
        </Panel>
      ) : null}

      <Panel title="Processing history">
        {batch.processingRuns.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Processing Run</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Input</th>
                  <th className="px-4 py-2 font-medium">Yield</th>
                  <th className="px-4 py-2 font-medium">Wastage</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">QAQC</th>
                </tr>
              </thead>
              <tbody>
                {batch.processingRuns.map((run) => (
                  <tr key={run.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <Link href={`/processing/${run.id}`} className="text-primary-text hover:underline">
                        {run.processingRunNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{run.processingDate}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(run.inputQuantity, run.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(run.yieldQuantity, run.unit)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{formatQuantity(run.wastageQuantity, run.unit)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge>{labelProcessingStatus(run.status)}</StatusBadge>
                    </td>
                    <td className="px-4 py-2">{labelQaqcResult(run.qaqcResult)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No processing runs yet for this parent batch.</p>
        )}
      </Panel>
    </div>
  );
}
