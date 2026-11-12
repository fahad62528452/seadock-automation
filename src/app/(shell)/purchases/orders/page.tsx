import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";
import { labelPurchaseOrderStatus } from "@/lib/procurement-labels";
import { listPurchaseOrders } from "@/services/procurement/procurement-service";
import type { PurchaseOrderListItem } from "@/types/procurement";

export const metadata: Metadata = {
  title: "Purchase Orders",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const orders = await listPurchaseOrders();

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        description="Procurement orders issued to vendors."
        actions={
          <Can permission={PERMISSIONS.purchasesManage}>
            <Link
              href="/purchases/orders/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover"
            >
              Create Purchase Order
            </Link>
          </Can>
        }
      />
      {params.created ? <div className="mb-4"><Alert tone="success">Purchase order created successfully.</Alert></div> : null}

      <Panel>
        <DataTable<PurchaseOrderListItem>
          caption="Purchase orders"
          columns={[
            {
              id: "po",
              header: "PO Number",
              className: "whitespace-nowrap font-medium",
              cell: (row) => (
                <Link href={`/purchases/orders/${row.id}`} className="text-primary-text hover:underline">
                  {row.poNumber}
                </Link>
              ),
            },
            { id: "vendor", header: "Vendor", cell: (row) => row.vendorName },
            { id: "date", header: "PO Date", className: "whitespace-nowrap", cell: (row) => row.poDate },
            {
              id: "expected",
              header: "Expected Date",
              className: "whitespace-nowrap",
              cell: (row) => row.expectedDate ?? "—",
            },
            { id: "items", header: "Items", className: "whitespace-nowrap", cell: (row) => String(row.itemCount) },
            {
              id: "status",
              header: "Status",
              cell: (row) => <StatusBadge>{labelPurchaseOrderStatus(row.status)}</StatusBadge>,
            },
            {
              id: "createdBy",
              header: "Created By",
              cell: (row) => row.createdByName ?? "—",
            },
            {
              id: "createdAt",
              header: "Created",
              className: "whitespace-nowrap",
              cell: (row) => formatTimestamp(row.createdAt),
            },
            {
              id: "actions",
              header: "Actions",
              cell: (row) => (
                <Link href={`/purchases/orders/${row.id}`} className="text-primary-text hover:underline">
                  View
                </Link>
              ),
            },
          ]}
          rows={orders}
          getRowKey={(row) => row.id}
          emptyTitle="No purchase orders yet."
          emptyDescription="Create a purchase order against a vendor to begin receiving."
        />
      </Panel>
      <p className="mt-2 text-[12px] text-ink-muted">Created times are taken from each purchase order record. Sorted latest first.</p>
    </div>
  );
}
