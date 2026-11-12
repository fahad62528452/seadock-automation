import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { labelGoodsReceiptStatus } from "@/lib/procurement-labels";
import { listGoodsReceipts } from "@/services/procurement/procurement-service";
import type { GoodsReceiptListItem } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Goods Received",
};

export default async function GoodsReceivedPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const receipts = await listGoodsReceipts();

  return (
    <div>
      <PageHeader
        title="Goods Received"
        description="Receiving records that start the batch traceability chain."
        actions={
          <Can permission={PERMISSIONS.purchasesManage}>
            <Link
              href="/purchases/goods-received/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Receive Goods
            </Link>
          </Can>
        }
      />
      {params.created ? (
        <div className="mb-4">
          <Alert tone="success">Goods receipt recorded. Incoming QAQC and batch creation were processed together.</Alert>
        </div>
      ) : null}

      <Panel>
        <DataTable<GoodsReceiptListItem>
          caption="Goods receipts"
          columns={[
            {
              id: "receipt",
              header: "Receipt Number",
              className: "whitespace-nowrap font-medium",
              cell: (row) => (
                <Link href={`/purchases/goods-received/${row.id}`} className="text-primary-text hover:underline">
                  {row.receiptNumber}
                </Link>
              ),
            },
            {
              id: "po",
              header: "PO Number",
              className: "whitespace-nowrap",
              cell: (row) => (
                <Link href={`/purchases/orders/${row.purchaseOrderId}`} className="text-primary-text hover:underline">
                  {row.poNumber}
                </Link>
              ),
            },
            { id: "vendor", header: "Vendor", cell: (row) => row.vendorName },
            {
              id: "received",
              header: "Received Date",
              className: "whitespace-nowrap",
              cell: (row) => formatTimestamp(row.receivedAt),
            },
            { id: "driver", header: "Driver", cell: (row) => row.driverName ?? "—" },
            { id: "vehicle", header: "Vehicle", cell: (row) => row.vehicleNumber ?? "—" },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge>{labelGoodsReceiptStatus(row.status)}</StatusBadge>,
            },
            {
              id: "actions",
              header: "Actions",
              cell: (row) => (
                <Link href={`/purchases/goods-received/${row.id}`} className="text-primary-text hover:underline">
                  View
                </Link>
              ),
            },
          ]}
          rows={receipts}
          getRowKey={(row) => row.id}
          emptyTitle="No goods receipts yet."
          emptyDescription="Receive goods against an issued purchase order to create the first batches."
        />
      </Panel>
    </div>
  );
}
