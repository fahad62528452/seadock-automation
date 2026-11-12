import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { PERMISSIONS } from "@/lib/permissions";
import { labelVendorStatus } from "@/lib/procurement-labels";
import { getVendor } from "@/services/procurement/procurement-service";

export const metadata: Metadata = {
  title: "Vendor",
};

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={vendor.vendorName}
        description={vendor.vendorCode}
        actions={
          <Can permission={PERMISSIONS.purchasesManage}>
            <Link
              href={`/purchases/vendors/${vendor.id}/edit`}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 text-[13px] hover:bg-surface-muted"
            >
              Edit
            </Link>
          </Can>
        }
      />
      {query.created ? <Alert tone="success">Vendor created successfully.</Alert> : null}
      {query.updated ? <Alert tone="success">Vendor updated successfully.</Alert> : null}

      <Panel title="Vendor details">
        <dl className="grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-[12px] text-ink-muted">Vendor Code</dt>
            <dd className="mt-1 text-[13px] font-medium">{vendor.vendorCode}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge>{labelVendorStatus(vendor.status)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Contact Person</dt>
            <dd className="mt-1 text-[13px]">{vendor.contactPerson ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Phone</dt>
            <dd className="mt-1 text-[13px]">{vendor.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Email</dt>
            <dd className="mt-1 text-[13px]">{vendor.email ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-ink-muted">Address</dt>
            <dd className="mt-1 text-[13px] whitespace-pre-wrap">{vendor.address ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[12px] text-ink-muted">Notes</dt>
            <dd className="mt-1 text-[13px] whitespace-pre-wrap">{vendor.notes ?? "—"}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
