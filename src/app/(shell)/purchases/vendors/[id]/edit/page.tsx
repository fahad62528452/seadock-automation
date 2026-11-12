import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VendorForm } from "@/components/procurement/vendor-form";
import { PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { updateVendorAction } from "@/app/(shell)/purchases/actions";
import { requirePermission } from "@/lib/authz";
import { PERMISSIONS } from "@/lib/permissions";
import { getVendor } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Edit Vendor",
};

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }) {
  requirePermission(PERMISSIONS.purchasesManage);
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  const action = updateVendorAction.bind(null, vendor.id);

  return (
    <div>
      <PageHeader title={`Edit ${vendor.vendorName}`} description={vendor.vendorCode} />
      <Panel>
        <div className="p-4">
          <VendorForm action={action} vendor={vendor} submitLabel="Save Changes" />
        </div>
      </Panel>
    </div>
  );
}
