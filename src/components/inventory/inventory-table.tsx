import Link from "next/link";
import { StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { freshWindowLabel, getFreshWindowStatus } from "@/lib/fresh-window";
import { labelInventoryType } from "@/lib/fulfillment-labels";
import { formatTimestamp } from "@/lib/format";
import {
  inventoryAgeDays,
  labelInventoryItemStatus,
  labelLifecycle,
} from "@/lib/inventory-labels";
import { formatQuantity } from "@/lib/procurement-labels";
import { toneForStatusLabel } from "@/lib/status-tones";
import type { InventoryListItem } from "@/types/inventory";

export type InventoryTableOptions = {
  showAllocation?: boolean;
  showProcessingRun?: boolean;
  emphasiseFreshWindow?: boolean;
  ageFromFrozenAt?: boolean;
};

export function InventoryTable({
  rows,
  emptyTitle,
  emptyDescription,
  options = {},
}: {
  rows: InventoryListItem[];
  emptyTitle: string;
  emptyDescription: string;
  options?: InventoryTableOptions;
}) {
  const {
    showAllocation = true,
    showProcessingRun = true,
    emphasiseFreshWindow = false,
    ageFromFrozenAt = false,
  } = options;
  const now = new Date();

  return (
    <DataTable<InventoryListItem>
      caption="Inventory items"
      rows={rows}
      getRowKey={(row) => row.id}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      columns={[
        {
          id: "batch",
          header: "Batch",
          className: "whitespace-nowrap font-medium",
          cell: (row) => (
            <Link href={`/inventory/batches/${row.batchId}`} className="text-primary-text hover:underline">
              {row.batchNumber}
            </Link>
          ),
        },
        {
          id: "type",
          header: "Type",
          cell: (row) => labelInventoryType(row.inventoryType),
        },
        {
          id: "product",
          header: "Product",
          cell: (row) => row.productSpecies,
        },
        {
          id: "total",
          header: "Total",
          className: "whitespace-nowrap",
          cell: (row) => formatQuantity(row.quantity, row.unit),
        },
        {
          id: "reserved",
          header: "Reserved",
          className: "whitespace-nowrap",
          cell: (row) => formatQuantity(row.reservedQuantity, row.unit),
        },
        {
          id: "available",
          header: "Available",
          className: "whitespace-nowrap",
          cell: (row) => formatQuantity(row.availableQuantity, row.unit),
        },
        {
          id: "lifecycle",
          header: "Lifecycle",
          cell: (row) => (
            <StatusBadge tone={toneForStatusLabel(labelLifecycle(row.lifecycle))}>
              {labelLifecycle(row.lifecycle)}
            </StatusBadge>
          ),
        },
        {
          id: "status",
          header: "Status",
          cell: (row) => (
            <StatusBadge tone={toneForStatusLabel(labelInventoryItemStatus(row.status))}>
              {labelInventoryItemStatus(row.status)}
            </StatusBadge>
          ),
        },
        {
          id: "origin",
          header: "Origin / Received",
          className: "whitespace-nowrap",
          cell: (row) => formatTimestamp(row.originAt),
        },
        {
          id: "age",
          header: ageFromFrozenAt ? "Age since frozen (days)" : "Age (days)",
          className: "whitespace-nowrap tabular-nums",
          cell: (row) => {
            const anchor = ageFromFrozenAt && row.frozenAt ? row.frozenAt : row.originAt;
            return String(inventoryAgeDays(anchor, now));
          },
        },
        {
          id: "freshUntil",
          header: "Fresh until",
          className: "whitespace-nowrap",
          cell: (row) => {
            if (row.lifecycle !== "fresh") return "—";
            const windowStatus = getFreshWindowStatus(row.originAt, now);
            if (emphasiseFreshWindow) {
              return (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <span>{formatTimestamp(row.freshUntil)}</span>
                  <StatusBadge tone={toneForStatusLabel(freshWindowLabel(windowStatus))}>
                    {freshWindowLabel(windowStatus)}
                  </StatusBadge>
                </span>
              );
            }
            return formatTimestamp(row.freshUntil);
          },
        },
        {
          id: "frozenAt",
          header: "Frozen at",
          className: "whitespace-nowrap",
          cell: (row) => (row.frozenAt ? formatTimestamp(row.frozenAt) : "—"),
        },
        ...(showProcessingRun
          ? [
              {
                id: "processingRun",
                header: "Processing run",
                className: "whitespace-nowrap",
                cell: (row: InventoryListItem) =>
                  row.processingRunId ? (
                    <Link href={`/processing/${row.processingRunId}`} className="text-primary-text hover:underline">
                      View run
                    </Link>
                  ) : (
                    "—"
                  ),
              } as const,
            ]
          : []),
        ...(showAllocation
          ? [
              {
                id: "allocation",
                header: "Allocation",
                cell: (row: InventoryListItem) => row.allocationSummary ?? "—",
              } as const,
            ]
          : []),
      ]}
    />
  );
}
