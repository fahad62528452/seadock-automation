import type { Metadata } from "next";
import Link from "next/link";
import { PageActions, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { getNavItem } from "@/lib/navigation";
import { formatQuantity, labelProcessingStatus, labelQaqcResult } from "@/lib/procurement-labels";
import { listProcessingRuns } from "@/services/processing/processing-service";
import type { ProcessingRunListItem } from "@/types/processing";

const nav = getNavItem("/processing/qaqc");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function ProcessingQaqcPage() {
  const runs = await listProcessingRuns();
  const withQaqc = runs.filter((run) => run.qaqcResult);

  return (
    <div className="space-y-3">
      <PageActions description={nav.description} />
      <Panel>
        <DataTable<ProcessingRunListItem>
          caption="Processing QAQC"
          columns={[
            {
              id: "run",
              header: "Processing Run",
              className: "whitespace-nowrap font-medium",
              cell: (row) => (
                <Link href={`/processing/${row.id}`} className="text-primary-text hover:underline">
                  {row.processingRunNumber}
                </Link>
              ),
            },
            {
              id: "batch",
              header: "Parent Batch",
              className: "whitespace-nowrap",
              cell: (row) => (
                <Link href={`/inventory/batches/${row.parentBatchId}`} className="text-primary-text hover:underline">
                  {row.batchNumber}
                </Link>
              ),
            },
            { id: "product", header: "Product", cell: (row) => row.productSpecies },
            {
              id: "input",
              header: "Input",
              className: "whitespace-nowrap",
              cell: (row) => formatQuantity(row.inputQuantity, row.unit),
            },
            {
              id: "status",
              header: "Run Status",
              cell: (row) => <StatusBadge tone="neutral">{labelProcessingStatus(row.status)}</StatusBadge>,
            },
            {
              id: "qaqc",
              header: "QAQC",
              cell: (row) =>
                row.qaqcResult ? (
                  <StatusBadge
                    tone={
                      row.qaqcResult === "passed" ? "success" : row.qaqcResult === "failed" ? "danger" : "warning"
                    }
                  >
                    {labelQaqcResult(row.qaqcResult)}
                  </StatusBadge>
                ) : (
                  <span className="text-ink-muted">—</span>
                ),
            },
          ]}
          rows={withQaqc}
          getRowKey={(row) => row.id}
          emptyTitle="No processing QAQC recorded"
          emptyDescription="Complete a processing run with QAQC to see results here."
        />
      </Panel>
    </div>
  );
}
