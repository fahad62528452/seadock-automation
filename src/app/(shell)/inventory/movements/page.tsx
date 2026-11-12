import type { Metadata } from "next";
import { InventoryMovementsTable } from "@/components/inventory/inventory-movements-table";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { getNavItem } from "@/lib/navigation";
import { listInventoryMovements } from "@/services/inventory/inventory-service";

const nav = getNavItem("/inventory/movements");

export const metadata: Metadata = {
  title: nav.label,
};

export default async function InventoryMovementsPage() {
  // Movement history uses stored performed_at values only — no request-time clock.
  const movements = await listInventoryMovements({ limit: 200 });

  return (
    <div className="space-y-4">
      <PageHeader title={nav.label} description={nav.description} />
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
