import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailPoReviewForm } from "@/components/email/email-po-review-form";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { listCustomers } from "@/services/customer-orders/customer-order-service";
import { getEmailPoCandidate } from "@/services/email/email-intake-service";
import {
  confirmCandidateAction,
  ignoreCandidateAction,
  markActionRequiredAction,
  retryExtractionAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Email PO Review",
};

const REVIEW_LABELS = {
  new: "New",
  needs_review: "Needs Review",
  ready_to_confirm: "Ready to Confirm",
  confirmed: "Confirmed",
  ignored: "Ignored",
  failed: "Failed",
} as const;

export default async function EmailPoCandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [candidate, customers] = await Promise.all([getEmailPoCandidate(id), listCustomers()]);
  if (!candidate) notFound();

  const confirmAction = confirmCandidateAction.bind(null, id);
  const ignoreAction = ignoreCandidateAction.bind(null, id);
  const actionRequiredAction = markActionRequiredAction.bind(null, id);
  const retryAction = retryExtractionAction.bind(null, id);

  return (
    <div>
      <PageHeader
        title={candidate.email.subject ?? "Email PO candidate"}
        description="Review extracted values, resolve warnings, then confirm to create a Customer PO."
        actions={
          <Link
            href="/customer-orders/inbox"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-muted"
          >
            Back to inbox
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge>{REVIEW_LABELS[candidate.reviewStatus]}</StatusBadge>
        {candidate.detectionLabel ? <StatusBadge>{candidate.detectionLabel}</StatusBadge> : null}
        {candidate.linkedCustomerPoId ? (
          <Link
            href={`/customer-orders/${candidate.linkedCustomerPoId}`}
            className="text-[13px] font-medium text-primary-text hover:underline"
          >
            Open Customer PO
          </Link>
        ) : null}
      </div>

      {candidate.warnings.length ? (
        <div className="mb-4 space-y-2">
          {candidate.warnings.map((warning) => (
            <Alert key={warning} tone="error">
              {warning}
            </Alert>
          ))}
        </div>
      ) : null}

      {candidate.actionRequiredReasons.length ? (
        <div className="mb-4">
          <Alert tone="error">
            Action required: {candidate.actionRequiredReasons.join(", ")}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <div className="space-y-4">
          <Panel title="Email">
            <dl className="grid gap-3 p-4 text-[13px]">
              <div>
                <dt className="text-ink-muted">Sender</dt>
                <dd>{candidate.email.sender ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Recipient</dt>
                <dd>{candidate.email.recipient ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Subject</dt>
                <dd>{candidate.email.subject ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Received At</dt>
                <dd>
                  {candidate.email.receivedAt ? formatTimestamp(candidate.email.receivedAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Thread</dt>
                <dd className="break-all">{candidate.email.threadId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Snippet</dt>
                <dd>{candidate.email.snippet ?? "—"}</dd>
              </div>
              {candidate.email.bodyText ? (
                <div>
                  <dt className="text-ink-muted">Body (excerpt)</dt>
                  <dd className="whitespace-pre-wrap text-ink-secondary">
                    {candidate.email.bodyText.slice(0, 1200)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Panel>

          <Panel title="Attachments">
            {candidate.attachments.length === 0 ? (
              <p className="p-4 text-[13px] text-ink-muted">No attachments.</p>
            ) : (
              <ul className="divide-y divide-border text-[13px]">
                {candidate.attachments.map((attachment) => (
                  <li key={attachment.id} className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <div className="font-medium text-ink">{attachment.filename}</div>
                      <div className="text-ink-muted">
                        {attachment.mimeType ?? "unknown type"}
                        {attachment.sizeBytes != null ? ` · ${attachment.sizeBytes} bytes` : ""}
                      </div>
                      {attachment.extractionError ? (
                        <div className="mt-1 text-warning">{attachment.extractionError}</div>
                      ) : null}
                    </div>
                    <StatusBadge>{attachment.extractionStatus}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel title="Extracted PO (human review)">
          <div className="p-4">
            <EmailPoReviewForm
              candidate={candidate}
              customers={customers}
              confirmAction={confirmAction}
              ignoreAction={ignoreAction}
              actionRequiredAction={actionRequiredAction}
              retryAction={retryAction}
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}
