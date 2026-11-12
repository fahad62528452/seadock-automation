import type { Metadata } from "next";
import { connection } from "next/server";
import { Can } from "@/components/auth/can";
import { FreezeInventoryForm } from "@/components/inventory/freeze-inventory-form";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { InventorySummaryCards } from "@/components/inventory/inventory-summary-cards";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { Alert, PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { parseInventorySearchParams } from "@/lib/inventory-page-params";
import { getNavItem } from "@/lib/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { getInventorySummary, listInventory } from "@/services/inventory/inventory-service";

const nav = getNavItem("/inventory");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function InventoryOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = searchParams ? await searchParams : {};
  const { search, type, lifecycle, filters } = parseInventorySearchParams(params);

  const [summary, items] = await Promise.all([getInventorySummary(), listInventory(filters)]);
  const rows = items.filter((row) => row.quantity > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={nav.label}
        description={nav.description}
        actions={
          <Can permission={PERMISSIONS.inventoryManage}>
            <FreezeInventoryForm returnTo="/inventory" />
          </Can>
        }
      />

      {params.frozen ? (
        <Alert tone="success">Eligible fresh stock has been moved to frozen inventory.</Alert>
      ) : null}
      {typeof params.error === "string" ? <Alert tone="error">{decodeURIComponent(params.error)}</Alert> : null}

      <InventorySummaryCards summary={summary} />

      <Panel>
        <InventoryFilters search={search} inventoryType={type} lifecycle={lifecycle} />
        <InventoryTable
          rows={rows}
          emptyTitle="No inventory balances found."
          emptyDescription="Goods receipt and processing flows create parent-batch inventory rows."
        />
      </Panel>
    </div>
  );
}
