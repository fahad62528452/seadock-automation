import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { PERMISSIONS } from "@/lib/permissions";
import { formatPercent, formatQuantity, labelProcessingStatus, labelQaqcResult } from "@/lib/procurement-labels";
import { listProcessingRuns } from "@/services/processing/processing-service";
import type { ProcessingRunListItem } from "@/types/processing";

export const metadata: Metadata = {
  title: "Processing",
};

export default async function ProcessingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const runs = await listProcessingRuns();

  return (
    <div>
      <PageHeader
        title="Processing"
        description="Convert parent-batch raw inventory into processed yield and wastage while preserving batch traceability."
        actions={
          <Can permission={PERMISSIONS.processingManage}>
            <Link
              href="/processing/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              New Processing Run
            </Link>
          </Can>
        }
      />
      {params.completed ? (
        <div className="mb-4">
          <Alert tone="success">Processing run completed.</Alert>
        </div>
      ) : null}
      {params.draft ? (
        <div className="mb-4">
          <Alert tone="success">Processing draft saved. Complete it when yield, wastage, and QAQC are ready.</Alert>
        </div>
      ) : null}

      <Panel>
        <DataTable<ProcessingRunListItem>
          caption="Processing runs"
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
              header: "Input Quantity",
              className: "whitespace-nowrap",
              cell: (row) => formatQuantity(row.inputQuantity, row.unit),
            },
            {
              id: "yield",
              header: "Yield",
              className: "whitespace-nowrap",
              cell: (row) => formatQuantity(row.yieldQuantity, row.unit),
            },
            {
              id: "wastage",
              header: "Wastage",
              className: "whitespace-nowrap",
              cell: (row) => formatQuantity(row.wastageQuantity, row.unit),
            },
            {
              id: "yieldPct",
              header: "Yield %",
              className: "whitespace-nowrap",
              cell: (row) => formatPercent(row.yieldPercent),
            },
            {
              id: "wastagePct",
              header: "Wastage %",
              className: "whitespace-nowrap",
              cell: (row) => formatPercent(row.wastagePercent),
            },
            {
              id: "date",
              header: "Processing Date",
              className: "whitespace-nowrap",
              cell: (row) => row.processingDate,
            },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge>{labelProcessingStatus(row.status)}</StatusBadge>,
            },
            {
              id: "qaqc",
              header: "QAQC",
              cell: (row) => labelQaqcResult(row.qaqcResult),
            },
            {
              id: "operator",
              header: "Processed By",
              cell: (row) => row.operatorName ?? "—",
            },
            {
              id: "actions",
              header: "Actions",
              cell: (row) => (
                <Link href={`/processing/${row.id}`} className="text-primary-text hover:underline">
                  View
                </Link>
              ),
            },
          ]}
          rows={runs}
          getRowKey={(row) => row.id}
          emptyTitle="No processing runs found."
          emptyDescription="Create a processing run from an eligible parent batch to record yield and wastage."
        />
      </Panel>
    </div>
  );
}
