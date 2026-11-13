import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { InventoryModuleTabs } from "@/components/inventory/inventory-module-tabs";
import { PageActions, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { freshWindowLabel } from "@/lib/fresh-window";
import { formatQuantity } from "@/lib/procurement-labels";
import { toneForStatusLabel } from "@/lib/status-tones";
import { listBatches } from "@/services/procurement/procurement-service";
import type { BatchListItem } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Batches",
};

export default async function BatchesPage() {
  await connection();
  const batches = await listBatches();

  return (
    <div className="space-y-3">
      <PageActions description="Parent batch identities used through receiving, processing, and fulfilment." />
      <InventoryModuleTabs pathname="/inventory/batches" />
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
              cell: (row) => (
                <StatusBadge tone={toneForStatusLabel(freshWindowLabel(row.freshStatus))}>
                  {freshWindowLabel(row.freshStatus)}
                </StatusBadge>
              ),
            },
          ]}
          rows={batches}
          getRowKey={(row) => row.id}
          emptyTitle="No batches yet"
          emptyDescription="Batches appear after goods are received and incoming QAQC is accepted."
        />
      </Panel>
    </div>
  );
}
