import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { freshWindowLabel } from "@/lib/fresh-window";
import { formatQuantity } from "@/lib/procurement-labels";
import { listBatches } from "@/services/procurement/procurement-service";
import type { BatchListItem } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Batches",
};

export default async function BatchesPage() {
  // Fresh Status uses getFreshWindowStatus(receivedAt) → new Date() (2-day / approaching rules).
  // Request-time rendering is required; Next may warn that navigation is not instant.
  await connection();
  const batches = await listBatches();

  return (
    <div>
      <PageHeader
        title="Batches"
        description="Parent batch identities created after incoming QAQC. The batch number continues through downstream operations."
      />
      <Panel>
        <DataTable<BatchListItem>
          caption="Batches"
          columns={[
            {
              id: "batch",
              header: "Batch Number",
              className: "whitespace-nowrap font-semibold",
              cell: (row) => (
                <Link href={`/inventory/batches/${row.id}`} className="text-primary-text hover:underline">
                  {row.batchNumber}
                </Link>
              ),
            },
            { id: "vendor", header: "Vendor", cell: (row) => row.vendorName },
            { id: "product", header: "Product / Species", cell: (row) => row.productSpecies },
            {
              id: "receivedQty",
              header: "Received Qty",
              cell: (row) => formatQuantity(row.receivedQuantity, row.unit),
            },
            {
              id: "currentQty",
              header: "Current Qty",
              cell: (row) => formatQuantity(row.remainingQuantity, row.unit),
            },
            {
              id: "receivedAt",
              header: "Received At",
              className: "whitespace-nowrap",
              cell: (row) => formatTimestamp(row.receivedAt),
            },
            {
              id: "freshUntil",
              header: "Fresh Until",
              className: "whitespace-nowrap",
              cell: (row) => formatTimestamp(row.freshUntil),
            },
            {
              id: "fresh",
              header: "Fresh Status",
              cell: (row) => <StatusBadge>{freshWindowLabel(row.freshStatus)}</StatusBadge>,
            },
          ]}
          rows={batches}
          getRowKey={(row) => row.id}
          emptyTitle="No batches yet."
          emptyDescription="Batches appear after goods are received and incoming QAQC is accepted."
        />
      </Panel>
    </div>
  );
}
