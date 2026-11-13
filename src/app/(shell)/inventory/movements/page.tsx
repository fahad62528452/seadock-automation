import type { Metadata } from "next";
import { InventoryModuleTabs } from "@/components/inventory/inventory-module-tabs";
import { InventoryMovementsTable } from "@/components/inventory/inventory-movements-table";
import { PageActions } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { getNavItem } from "@/lib/navigation";
import { listInventoryMovements } from "@/services/inventory/inventory-service";

const nav = getNavItem("/inventory/movements");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function InventoryMovementsPage() {
  const movements = await listInventoryMovements({ limit: 200 });

  return (
    <div className="space-y-3">
      <PageActions description={nav.description} />
      <InventoryModuleTabs pathname="/inventory/movements" />
      <Panel>
        <InventoryMovementsTable
          rows={movements}
          emptyTitle={nav.emptyTitle}
          emptyDescription={nav.description}
        />
      </Panel>
    </div>
  );
}
