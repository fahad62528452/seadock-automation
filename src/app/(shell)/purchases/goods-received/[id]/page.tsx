import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { formatQuantity, labelGoodsReceiptStatus, labelQaqcResult } from "@/lib/procurement-labels";
import { getGoodsReceipt } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Goods Receipt",
};

export default async function GoodsReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const receipt = await getGoodsReceipt(id);
  if (!receipt) notFound();

  return (
    <div className="space-y-4">
      <PageHeader title={receipt.receiptNumber} description={`${receipt.poNumber} · ${receipt.vendorName}`} />
      {query.created ? (
        <Alert tone="success">Goods receipt saved with incoming QAQC and batch processing.</Alert>
      ) : null}

      <div className="rounded-md border border-border bg-surface px-4 py-3 text-[13px]">
        <p className="font-medium text-ink">Receiving → Incoming QAQC → Batch Creation</p>
        <p className="mt-1 text-ink-muted">
          Status: <StatusBadge>{labelGoodsReceiptStatus(receipt.status)}</StatusBadge>
        </p>
      </div>

      <Panel title="Receiving details">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[12px] text-ink-muted">PO Number</dt>
            <dd className="mt-1 text-[13px]">
              <Link href={`/purchases/orders/${receipt.purchaseOrderId}`} className="text-primary-text hover:underline">
                {receipt.poNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Vendor</dt>
            <dd className="mt-1 text-[13px]">{receipt.vendorName}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Received At</dt>
            <dd className="mt-1 text-[13px]">{formatTimestamp(receipt.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Driver Name</dt>
            <dd className="mt-1 text-[13px]">{receipt.driverName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Vehicle Number</dt>
            <dd className="mt-1 text-[13px]">{receipt.vehicleNumber ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-[12px] text-ink-muted">Notes</dt>
            <dd className="mt-1 text-[13px] whitespace-pre-wrap">{receipt.notes ?? "—"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Received items">
        <DataTable
          caption="Received items"
          columns={[
            { id: "product", header: "Product / Species", cell: (row) => row.productSpecies },
            {
              id: "qty",
              header: "Received Quantity",
              cell: (row) => formatQuantity(row.receivedQuantity, row.unit),
            },
            { id: "unit", header: "Unit", cell: (row) => row.unit },
            { id: "notes", header: "Notes", cell: (row) => row.notes ?? "—" },
          ]}
          rows={receipt.items}
          getRowKey={(row) => row.id}
          emptyTitle="No received items."
          emptyDescription="Receiving lines will appear here."
        />
      </Panel>

      <Panel title="Incoming QAQC">
        {receipt.qaqc ? (
          <dl className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-ink-muted">Inspection Date</dt>
              <dd className="mt-1 text-[13px]">{receipt.qaqc.inspectionDate}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Result</dt>
              <dd className="mt-1">
                <StatusBadge>{labelQaqcResult(receipt.qaqc.result)}</StatusBadge>
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[12px] text-ink-muted">Notes</dt>
              <dd className="mt-1 text-[13px] whitespace-pre-wrap">{receipt.qaqc.notes ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <div className="p-4 text-[13px] text-ink-muted">No incoming QAQC recorded.</div>
        )}
      </Panel>

      <Panel title="Parent batches">
        <DataTable
          caption="Batches created from this receipt"
          columns={[
            {
              id: "batch",
              header: "Batch Number",
              className: "font-semibold",
              cell: (row) => (
                <Link href={`/inventory/batches/${row.id}`} className="text-primary-text hover:underline">
                  {row.batchNumber}
                </Link>
              ),
            },
            { id: "product", header: "Product / Species", cell: (row) => row.productSpecies },
            {
              id: "qty",
              header: "Quantity",
              cell: (row) => formatQuantity(row.receivedQuantity, row.unit),
            },
          ]}
          rows={receipt.batches}
          getRowKey={(row) => row.id}
          emptyTitle="No batches created."
          emptyDescription="Batches are created only when incoming QAQC passes or is conditional."
        />
      </Panel>
    </div>
  );
}
