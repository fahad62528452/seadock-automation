import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { Can } from "@/components/auth/can";
import { PERMISSIONS } from "@/lib/permissions";
import { formatQuantity, labelPurchaseOrderStatus } from "@/lib/procurement-labels";
import { getPurchaseOrder } from "@/services/procurement/procurement-service";
import type { PurchaseOrderItemRecord } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Purchase Order",
};

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const order = await getPurchaseOrder(id);
  if (!order) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.poNumber}
        description={`${order.vendorCode} · ${order.vendorName}`}
        actions={
          <Can permission={PERMISSIONS.purchasesManage}>
            {["issued", "partially_received", "confirmed", "awaiting_verification"].includes(order.status) ? (
              <Link
                href={`/purchases/goods-received/new?po=${order.id}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
              >
                Receive Goods
              </Link>
            ) : null}
          </Can>
        }
      />
      {query.created ? <Alert tone="success">Purchase order created successfully.</Alert> : null}

      <Panel title="PO information">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[12px] text-ink-muted">PO Number</dt>
            <dd className="mt-1 text-[13px] font-medium">{order.poNumber}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Vendor</dt>
            <dd className="mt-1 text-[13px]">
              <Link href={`/purchases/vendors/${order.vendorId}`} className="text-primary-text hover:underline">
                {order.vendorName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge>{labelPurchaseOrderStatus(order.status)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">PO Date</dt>
            <dd className="mt-1 text-[13px]">{order.poDate}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Expected Date</dt>
            <dd className="mt-1 text-[13px]">{order.expectedDate ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Created By</dt>
            <dd className="mt-1 text-[13px]">{order.createdByName ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-[12px] text-ink-muted">Notes</dt>
            <dd className="mt-1 text-[13px] whitespace-pre-wrap">{order.notes ?? "—"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="PO items" description="Received and remaining quantities are calculated from goods receipts.">
        <DataTable<PurchaseOrderItemRecord>
          caption="Purchase order items"
          columns={[
            { id: "product", header: "Product", cell: (row) => row.productSpecies },
            {
              id: "ordered",
              header: "Ordered Quantity",
              cell: (row) => formatQuantity(row.orderedQuantity, row.unit),
            },
            {
              id: "received",
              header: "Received Quantity",
              cell: (row) => formatQuantity(row.receivedQuantity, row.unit),
            },
            {
              id: "remaining",
              header: "Remaining Quantity",
              cell: (row) => formatQuantity(row.remainingQuantity, row.unit),
            },
            { id: "unit", header: "Unit", cell: (row) => row.unit },
          ]}
          rows={order.items}
          getRowKey={(row) => row.id}
          emptyTitle="No items on this purchase order."
          emptyDescription="Line items are required before receiving."
        />
      </Panel>
    </div>
  );
}
