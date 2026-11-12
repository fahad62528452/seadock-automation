import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { formatTimestamp } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { listCustomerPurchaseOrders } from "@/services/customer-orders/customer-order-service";
import type { CustomerPoListItem } from "@/types/customer-orders";

export const metadata: Metadata = {
  title: "Customer Purchase Orders",
};

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const search = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const priority = typeof params.priority === "string" ? params.priority : "";
  const actionRequired = params.action === "required";
  const dueSoon = params.due === "soon";

  const orders = await listCustomerPurchaseOrders({
    search: search || undefined,
    status: status || undefined,
    priority: priority || undefined,
    actionRequired: actionRequired || undefined,
    dueSoonHours: dueSoon ? 48 : undefined,
  });

  return (
    <div>
      <PageHeader
        title="Customer Purchase Orders"
        description="Receive, approve, allocate, fulfil, and dispatch customer demand."
        actions={
          <Can permission={PERMISSIONS.customerOrdersCreate}>
            <Link
              href="/customer-orders/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Create Customer PO
            </Link>
          </Can>
        }
      />

      {params.created ? (
        <div className="mb-4">
          <Alert tone="success">Customer purchase order created successfully.</Alert>
        </div>
      ) : null}

      <Panel>
        <form className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:flex-wrap md:items-end">
          <label className="min-w-[12rem] flex-1 text-[12px] font-medium text-ink">
            Search
            <input
              name="q"
              defaultValue={search}
              placeholder="PO number or customer"
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px]"
            />
          </label>
          <label className="text-[12px] font-medium text-ink">
            Status
            <select name="status" defaultValue={status} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px]">
              <option value="">All</option>
              <option value="received">Received</option>
              <option value="under_review">Under Review</option>
              <option value="action_required">Action Required</option>
              <option value="approved">Approved</option>
              <option value="partially_allocated">Partially Allocated</option>
              <option value="ready_for_fulfillment">Ready for Fulfillment</option>
              <option value="partially_fulfilled">Partially Fulfilled</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="text-[12px] font-medium text-ink">
            Priority
            <select
              name="priority"
              defaultValue={priority}
              className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-3 text-[13px]"
            >
              <option value="">All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px] text-ink">
            <input type="checkbox" name="action" value="required" defaultChecked={actionRequired} />
            Action required
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px] text-ink">
            <input type="checkbox" name="due" value="soon" defaultChecked={dueSoon} />
            Due in 48 hours
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            Apply filters
          </button>
        </form>

        <DataTable<CustomerPoListItem>
          caption="Customer purchase orders"
          columns={[
            {
              id: "po",
              header: "PO Number",
              className: "whitespace-nowrap font-medium",
              cell: (row) => (
                <Link href={`/customer-orders/${row.id}`} className="text-primary-text hover:underline">
                  {row.poNumber}
                </Link>
              ),
            },
            {
              id: "customer",
              header: "Customer",
              cell: (row) => (
                <span>
                  {row.customerCode ? `${row.customerCode} · ` : ""}
                  {row.customerName}
                </span>
              ),
            },
            { id: "poDate", header: "PO Date", className: "whitespace-nowrap", cell: (row) => row.poDate ?? "—" },
            {
              id: "received",
              header: "Received",
              className: "whitespace-nowrap",
              cell: (row) => formatTimestamp(row.receivedAt),
            },
            {
              id: "required",
              header: "Required Delivery",
              className: "whitespace-nowrap",
              cell: (row) => row.requiredDeliveryDate ?? "—",
            },
            {
              id: "priority",
              header: "Priority",
              cell: (row) => <PriorityBadge priority={row.priority} />,
            },
            { id: "items", header: "Items", className: "whitespace-nowrap", cell: (row) => String(row.itemCount) },
            {
              id: "status",
              header: "Status",
              cell: (row) => (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <StatusBadge>{labelCustomerPoStatus(row.status)}</StatusBadge>
                  {row.actionRequired ? <StatusBadge>Action Required</StatusBadge> : null}
                </span>
              ),
            },
            {
              id: "actions",
              header: "Actions",
              cell: (row) => (
                <Link href={`/customer-orders/${row.id}`} className="text-primary-text hover:underline">
                  View
                </Link>
              ),
            },
          ]}
          rows={orders}
          getRowKey={(row) => row.id}
          emptyTitle="No customer purchase orders found."
          emptyDescription="Create a customer PO manually to begin intake. Email ingestion will connect later."
        />
      </Panel>
    </div>
  );
}
