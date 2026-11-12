import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCustomerAction } from "@/app/(shell)/customer-orders/actions";
import { Can } from "@/components/auth/can";
import { CustomerForm } from "@/components/customer-orders/customer-form";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { PERMISSIONS } from "@/lib/permissions";
import { getCustomer } from "@/services/customer-orders/customer-order-service";

export const metadata: Metadata = {
  title: "Customer",
};

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const updateAction = updateCustomerAction.bind(null, customer.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.name}
        description={`${customer.customerCode} · operational customer master`}
        actions={
          <Link
            href="/customer-orders/new"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            Create PO
          </Link>
        }
      />
      {query.created ? <Alert tone="success">Customer created successfully.</Alert> : null}
      {query.updated ? <Alert tone="success">Customer updated successfully.</Alert> : null}

      <Panel>
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 text-[13px]">
          <div>
            <dt className="text-[12px] text-ink-muted">Customer Code</dt>
            <dd className="mt-1 font-medium">{customer.customerCode}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge>{customer.status}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Contact</dt>
            <dd className="mt-1">{customer.contactPerson || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Phone</dt>
            <dd className="mt-1">{customer.phone || "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Email</dt>
            <dd className="mt-1">{customer.email || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-ink-muted">Address</dt>
            <dd className="mt-1 whitespace-pre-wrap">{customer.address || "—"}</dd>
          </div>
        </dl>
      </Panel>

      <Can permission={PERMISSIONS.customerOrdersManage}>
        <Panel title="Edit customer">
          <div className="p-4">
            <CustomerForm action={updateAction} customer={customer} submitLabel="Save Customer" />
          </div>
        </Panel>
      </Can>
    </div>
  );
}
