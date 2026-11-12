import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { PERMISSIONS } from "@/lib/permissions";
import { listCustomers } from "@/services/customer-orders/customer-order-service";
import type { CustomerRecord } from "@/types/customer-orders";

export const metadata: Metadata = {
  title: "Customers",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const customers = await listCustomers();

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Operational customer master used by customer purchase orders."
        actions={
          <Can permission={PERMISSIONS.customerOrdersManage}>
            <Link
              href="/customers/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Create Customer
            </Link>
          </Can>
        }
      />
      {params.created ? (
        <div className="mb-4">
          <Alert tone="success">Customer created successfully.</Alert>
        </div>
      ) : null}

      <Panel>
        <DataTable<CustomerRecord>
          caption="Customers"
          columns={[
            {
              id: "code",
              header: "Customer Code",
              className: "whitespace-nowrap font-medium",
              cell: (row) => (
                <Link href={`/customers/${row.id}`} className="text-primary-text hover:underline">
                  {row.customerCode}
                </Link>
              ),
            },
            { id: "name", header: "Name", cell: (row) => row.name },
            { id: "contact", header: "Contact Person", cell: (row) => row.contactPerson ?? "—" },
            { id: "phone", header: "Phone", cell: (row) => row.phone ?? "—" },
            { id: "email", header: "Email", cell: (row) => row.email ?? "—" },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge>{row.status}</StatusBadge>,
            },
            {
              id: "actions",
              header: "Actions",
              cell: (row) => (
                <Link href={`/customers/${row.id}`} className="text-primary-text hover:underline">
                  View
                </Link>
              ),
            },
          ]}
          rows={customers}
          getRowKey={(row) => row.id}
          emptyTitle="No customers found."
          emptyDescription="Create your first customer to raise customer purchase orders."
        />
      </Panel>
    </div>
  );
}
