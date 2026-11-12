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

const nav = getNavItem("/inventory/fresh");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function FreshInventoryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = searchParams ? await searchParams : {};
  const { search, type, filters } = parseInventorySearchParams(params, { lifecycle: "fresh" });

  const [summary, rows] = await Promise.all([
    getInventorySummary(),
    listInventory(filters).then((items) => items.filter((row) => row.quantity > 0)),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={nav.label}
        description={nav.description}
        actions={
          <Can permission={PERMISSIONS.inventoryManage}>
            <FreezeInventoryForm returnTo="/inventory/fresh" />
          </Can>
        }
      />

      {params.frozen ? (
        <Alert tone="success">Eligible fresh stock has been moved to frozen inventory.</Alert>
      ) : null}
      {typeof params.error === "string" ? <Alert tone="error">{decodeURIComponent(params.error)}</Alert> : null}

      <InventorySummaryCards summary={summary} showRawProcessed={false} />

      <Panel>
        <InventoryFilters search={search} inventoryType={type} lockLifecycle="fresh" />
        <InventoryTable
          rows={rows}
          emptyTitle={nav.emptyTitle}
          emptyDescription={nav.description}
          options={{ emphasiseFreshWindow: true }}
        />
      </Panel>
    </div>
  );
}
