import type { Metadata } from "next";
import { VendorForm } from "@/components/procurement/vendor-form";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { createVendorAction } from "@/app/(shell)/purchases/actions";
import { requirePermission } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Create Vendor",
};

export default function NewVendorPage() {
  requirePermission(PERMISSIONS.purchasesManage);

  return (
    <div>
      <PageHeader title="Create Vendor" description="Add a supplier that can be used on purchase orders." />
      <Panel>
        <div className="p-4">
          <VendorForm action={createVendorAction} submitLabel="Create Vendor" />
        </div>
      </Panel>
    </div>
  );
}
