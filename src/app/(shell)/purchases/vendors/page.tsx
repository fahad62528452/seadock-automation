import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { DataTable } from "@/components/ui/data-table";
import { PERMISSIONS } from "@/lib/permissions";
import { labelVendorStatus } from "@/lib/procurement-labels";
import { listVendors } from "@/services/procurement/procurement-service";
import type { VendorRecord } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Vendors",
};

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const vendors = await listVendors();

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Supplier master records used by purchase orders and receiving."
        actions={
          <Can permission={PERMISSIONS.purchasesManage}>
            <Link
              href="/purchases/vendors/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Create Vendor
            </Link>
          </Can>
        }
      />

      {params.created ? <div className="mb-4"><Alert tone="success">Vendor created successfully.</Alert></div> : null}
      {params.updated ? <div className="mb-4"><Alert tone="success">Vendor updated successfully.</Alert></div> : null}

      <Panel>
        <DataTable<VendorRecord>
          caption="Vendors"
          columns={[
            { id: "code", header: "Vendor Code", className: "whitespace-nowrap font-medium", cell: (row) => row.vendorCode },
            { id: "name", header: "Vendor Name", cell: (row) => row.vendorName },
            { id: "contact", header: "Contact Person", cell: (row) => row.contactPerson ?? "—" },
            { id: "phone", header: "Phone", className: "whitespace-nowrap", cell: (row) => row.phone ?? "—" },
            { id: "email", header: "Email", cell: (row) => row.email ?? "—" },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge>{labelVendorStatus(row.status)}</StatusBadge>,
            },
            {
              id: "actions",
              header: "Actions",
              className: "whitespace-nowrap",
              cell: (row) => (
                <div className="flex gap-2">
                  <Link href={`/purchases/vendors/${row.id}`} className="text-primary-text hover:underline">
                    View
                  </Link>
                  <Can permission={PERMISSIONS.purchasesManage}>
                    <Link href={`/purchases/vendors/${row.id}/edit`} className="text-primary-text hover:underline">
                      Edit
                    </Link>
                  </Can>
                </div>
              ),
            },
          ]}
          rows={vendors}
          getRowKey={(row) => row.id}
          emptyTitle="No vendors found."
          emptyDescription="Create your first vendor to get started."
        />
      </Panel>
    </div>
  );
}
