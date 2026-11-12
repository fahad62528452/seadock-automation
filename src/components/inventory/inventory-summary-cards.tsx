import { formatKg } from "@/lib/format";
import { StatCard } from "@/components/ui/stat-card";
import type { InventoryBalanceSummary } from "@/types/inventory";

export function InventorySummaryCards({
  summary,
  showRawProcessed = true,
}: {
  summary: InventoryBalanceSummary;
  showRawProcessed?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      <StatCard
        label="Total on hand"
        value={formatKg(summary.totalQuantity)}
        detail="All inventory balances"
        href="/inventory"
      />
      <StatCard
        label="Available"
        value={formatKg(summary.availableQuantity)}
        detail="Total minus reserved"
        href="/inventory"
      />
      <StatCard
        label="Reserved"
        value={formatKg(summary.reservedQuantity)}
        detail="Allocated to customer POs"
        href="/inventory"
      />
      <StatCard
        label="Fresh"
        value={formatKg(summary.freshQuantity)}
        detail="Raw and processed not yet frozen"
        href="/inventory/fresh"
      />
      <StatCard
        label="Frozen"
        value={formatKg(summary.frozenQuantity)}
        detail="Frozen stock balances"
        href="/inventory/frozen"
      />
      <StatCard
        label="Wastage"
        value={formatKg(summary.wastageQuantity)}
        detail="Processing wastage recorded"
        href="/inventory/wastage"
      />
      {showRawProcessed ? (
        <>
          <StatCard
            label="Raw"
            value={formatKg(summary.rawQuantity)}
            detail="Unprocessed parent-batch stock"
            href="/inventory/raw"
          />
          <StatCard
            label="Processed"
            value={formatKg(summary.processedQuantity)}
            detail="Yield after processing"
            href="/inventory/processed"
          />
        </>
      ) : null}
    </div>
  );
}
