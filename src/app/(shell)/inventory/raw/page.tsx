import type { Metadata } from "next";
import { connection } from "next/server";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventorySummaryCards } from "@/components/inventory/inventory-summary-cards";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { parseInventorySearchParams } from "@/lib/inventory-page-params";
import { getNavItem } from "@/lib/navigation";
import { getInventorySummary, listInventory } from "@/services/inventory/inventory-service";

const nav = getNavItem("/inventory/raw");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function RawInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = searchParams ? await searchParams : {};
  const { search, lifecycle, filters } = parseInventorySearchParams(params, { inventoryType: "raw" });

  const [summary, rows] = await Promise.all([
    getInventorySummary(),
    listInventory(filters).then((items) => items.filter((row) => row.quantity > 0)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={nav.label} description={nav.description} />
      <InventorySummaryCards summary={summary} showRawProcessed={false} />
      <Panel>
        <InventoryFilters search={search} lifecycle={lifecycle} lockInventoryType="raw" />
        <InventoryTable
          rows={rows}
          emptyTitle={nav.emptyTitle}
          emptyDescription={nav.description}
        />
      </Panel>
    </div>
  );
}
