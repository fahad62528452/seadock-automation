import type { Metadata } from "next";
import { PurchaseOrderForm } from "@/components/procurement/purchase-order-form";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { createPurchaseOrderAction } from "@/app/(shell)/purchases/actions";
import { requirePermission } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import { listVendors } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Create Purchase Order",
};

export default async function NewPurchaseOrderPage() {
  requirePermission(PERMISSIONS.purchasesManage);
  const vendors = await listVendors();

  return (
    <div>
      <PageHeader
        title="Create Purchase Order"
        description="Issue a vendor purchase order with one or more line items."
      />
      <Panel>
        <div className="p-4">
          <PurchaseOrderForm action={createPurchaseOrderAction} vendors={vendors.filter((vendor) => vendor.status === "active")} />
        </div>
      </Panel>
    </div>
  );
}
