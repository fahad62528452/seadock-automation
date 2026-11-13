import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import { Alert, Button, PageActions, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Panel } from "@/components/ui/panel";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { formatTimestamp } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { toneForStatusLabel } from "@/lib/status-tones";
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
    <div className="space-y-3">
      <PageActions
        description="Receive, approve, allocate, fulfil, and dispatch customer demand."
        actions={
          <Can permission={PERMISSIONS.customerOrdersCreate}>
            <Link
              href="/customer-orders/new"
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Create Customer PO
            </Link>
          </Can>
        }
      />

      {params.created ? <Alert tone="success">Customer purchase order created successfully.</Alert> : null}

      <Panel>
        <ListToolbar
          resultCount={orders.length}
          resultLabel="orders"
          actions={
            <Button type="submit" form="customer-po-filters" variant="secondary">
              Apply
            </Button>
          }
        >
          <form
            id="customer-po-filters"
            className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end"
          >
            <label className="min-w-[10rem] flex-1 text-[11px] font-medium text-ink-muted">
              Search
              <input
                name="q"
                defaultValue={search}
                placeholder="PO number or customer"
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px]"
              />
            </label>
            <label className="text-[11px] font-medium text-ink-muted">
              Status
              <select
                name="status"
                defaultValue={status}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px]"
              >
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
            <label className="text-[11px] font-medium text-ink-muted">
              Priority
              <select
                name="priority"
                defaultValue={priority}
                className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[13px]"
              >
                <option value="">All</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-[12px] text-ink">
              <input type="checkbox" name="action" value="required" defaultChecked={actionRequired} />
              Action required
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-[12px] text-ink">
              <input type="checkbox" name="due" value="soon" defaultChecked={dueSoon} />
              Due in 48h
            </label>
          </form>
        </ListToolbar>

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
            {
              id: "required",
              header: "Required",
              className: "whitespace-nowrap",
              cell: (row) => row.requiredDeliveryDate ?? "—",
            },
            {
              id: "received",
              header: "Received",
              className: "whitespace-nowrap text-ink-muted",
              cell: (row) => formatTimestamp(row.receivedAt),
            },
            {
              id: "priority",
              header: "Priority",
              cell: (row) => <PriorityBadge priority={row.priority} />,
            },
            {
              id: "items",
              header: "Items",
              className: "whitespace-nowrap tabular-nums",
              cell: (row) => String(row.itemCount),
            },
            {
              id: "status",
              header: "Status",
              cell: (row) => (
                <span className="inline-flex flex-wrap items-center gap-1">
                  <StatusBadge tone={toneForStatusLabel(labelCustomerPoStatus(row.status))}>
                    {labelCustomerPoStatus(row.status)}
                  </StatusBadge>
                  {row.actionRequired ? <StatusBadge tone="danger">Action Required</StatusBadge> : null}
                </span>
              ),
            },
          ]}
          rows={orders}
          getRowKey={(row) => row.id}
          emptyTitle="No customer purchase orders"
          emptyDescription="Create a customer PO to begin intake."
          emptyAction={
            <Can permission={PERMISSIONS.customerOrdersCreate}>
              <Link
                href="/customer-orders/new"
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
              >
                Create Customer PO
              </Link>
            </Can>
          }
        />
      </Panel>
    </div>
  );
}
