import type { Metadata } from "next";
import { connection } from "next/server";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventoryModuleTabs } from "@/components/inventory/inventory-module-tabs";
import { InventorySummaryCards } from "@/components/inventory/inventory-summary-cards";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { PageActions } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { parseInventorySearchParams } from "@/lib/inventory-page-params";
import { getNavItem } from "@/lib/navigation";
import { getInventorySummary, listInventory } from "@/services/inventory/inventory-service";

const nav = getNavItem("/inventory/frozen");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function FrozenInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = searchParams ? await searchParams : {};
  const { search, type, filters } = parseInventorySearchParams(params, { lifecycle: "frozen" });

  const [summary, rows] = await Promise.all([
    getInventorySummary(),
    listInventory(filters).then((items) => items.filter((row) => row.quantity > 0)),
  ]);

  return (
    <div className="space-y-3">
      <PageActions description={nav.description} />
      <InventoryModuleTabs pathname="/inventory/frozen" />
      <InventorySummaryCards summary={summary} showRawProcessed={false} />
      <Panel>
        <InventoryFilters search={search} inventoryType={type} lockLifecycle="frozen" />
        <InventoryTable
          rows={rows}
          emptyTitle={nav.emptyTitle}
          emptyDescription={nav.description}
          options={{ ageFromFrozenAt: true }}
        />
      </Panel>
    </div>
  );
}
