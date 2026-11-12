import type { Metadata } from "next";
import Link from "next/link";
import { Can } from "@/components/auth/can";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { getNavItem } from "@/lib/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { listEmailPoCandidates } from "@/services/email/email-intake-service";
import type { EmailPoCandidateListItem } from "@/types/email";
import { SyncInboxButton } from "@/components/email/sync-inbox-button";
import { syncInboxAction } from "./actions";

const page = getNavItem("/customer-orders/inbox");

export const metadata: Metadata = {
  title: page.label,
};

const REVIEW_LABELS: Record<EmailPoCandidateListItem["reviewStatus"], string> = {
  new: "New",
  needs_review: "Needs Review",
  ready_to_confirm: "Ready to Confirm",
  confirmed: "Confirmed",
  ignored: "Ignored",
  failed: "Failed",
};

export default async function EmailPoInboxPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const candidates = await listEmailPoCandidates();

  return (
    <div>
      <PageHeader
        title="Email PO Inbox"
        description="Operational queue of email purchase-order candidates. Extracted values require human confirmation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission={PERMISSIONS.emailManage}>
              <SyncInboxButton syncAction={syncInboxAction} />
            </Can>
            <Can permission={PERMISSIONS.emailView}>
              <Link
                href="/settings/email"
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
              >
                Email Settings
              </Link>
            </Can>
          </div>
        }
      />

      {params.ignored ? (
        <div className="mb-4">
          <Alert tone="success">Email PO candidate ignored.</Alert>
        </div>
      ) : null}

      <Panel>
        <DataTable<EmailPoCandidateListItem>
          caption="Email PO candidates"
          columns={[
            {
              id: "received",
              header: "Received",
              className: "whitespace-nowrap text-ink-secondary",
              cell: (row) => (row.receivedAt ? formatTimestamp(row.receivedAt) : "—"),
            },
            {
              id: "sender",
              header: "Sender",
              cell: (row) => row.sender ?? "—",
            },
            {
              id: "subject",
              header: "Subject",
              cell: (row) => row.subject ?? "—",
            },
            {
              id: "detected",
              header: "Detected PO",
              cell: (row) => row.poNumber ?? row.detectionLabel ?? "—",
            },
            {
              id: "customer",
              header: "Customer",
              cell: (row) => row.customerName ?? "—",
            },
            {
              id: "status",
              header: "Extraction Status",
              cell: (row) => <StatusBadge>{REVIEW_LABELS[row.reviewStatus]}</StatusBadge>,
            },
            {
              id: "priority",
              header: "Priority",
              cell: (row) => (row.priority ? row.priority.toUpperCase() : "—"),
            },
            {
              id: "action",
              header: "Action",
              cell: (row) => (
                <Link
                  href={`/customer-orders/inbox/${row.id}`}
                  className="font-medium text-primary-text hover:underline"
                >
                  Review
                </Link>
              ),
            },
          ]}
          rows={candidates}
          getRowKey={(row) => row.id}
          emptyTitle={page.emptyTitle}
          emptyDescription={`${page.description} Use Sync Now after connecting an email provider.`}
        />
      </Panel>
    </div>
  );
}
