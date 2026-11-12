import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { formatTimestamp } from "@/lib/format";
import { labelMovementType } from "@/lib/inventory-labels";
import { formatQuantity } from "@/lib/procurement-labels";
import type { InventoryMovementListItem } from "@/types/inventory";

export function InventoryMovementsTable({
  rows,
  emptyTitle,
  emptyDescription,
}: {
  rows: InventoryMovementListItem[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <DataTable<InventoryMovementListItem>
      caption="Inventory movements"
      rows={rows}
      getRowKey={(row) => row.id}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      columns={[
        {
          id: "performed",
          header: "Performed",
          className: "whitespace-nowrap",
          cell: (row) => formatTimestamp(row.performedAt),
        },
        {
          id: "movement",
          header: "Movement",
          cell: (row) => labelMovementType(row.movementType),
        },
        {
          id: "batch",
          header: "Batch",
          className: "whitespace-nowrap",
          cell: (row) => row.batchNumber,
        },
        {
          id: "product",
          header: "Product",
          cell: (row) => row.productSpecies,
        },
        {
          id: "quantity",
          header: "Quantity",
          className: "whitespace-nowrap",
          cell: (row) => formatQuantity(row.quantity, row.unit),
        },
        {
          id: "balance",
          header: "Balance",
          className: "whitespace-nowrap",
          cell: (row) => `${formatQuantity(row.previousQuantity, row.unit)} → ${formatQuantity(row.newQuantity, row.unit)}`,
        },
        {
          id: "reference",
          header: "Reference",
          className: "whitespace-nowrap",
          cell: (row) =>
            row.referenceType && row.referenceId ? (
              <span>
                {row.referenceType} · {row.referenceId}
              </span>
            ) : (
              "—"
            ),
        },
        {
          id: "inventory",
          header: "Inventory item",
          className: "whitespace-nowrap font-mono text-[12px]",
          cell: (row) => (
            <Link href={`/inventory?q=${encodeURIComponent(row.inventoryItemId)}`} className="text-primary-text hover:underline">
              {row.inventoryItemId}
            </Link>
          ),
        },
        {
          id: "notes",
          header: "Notes",
          cell: (row) => row.notes ?? "—",
        },
      ]}
    />
  );
}
