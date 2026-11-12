import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { completeProcessingAction, createProcessingDraftAction } from "@/app/(shell)/processing/actions";
import { ProcessingForm } from "@/components/processing/processing-form";
import { Alert, PageHeader, StatusBadge } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { Can } from "@/components/auth/can";
import { formatTimestamp } from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatPercent, formatQuantity, labelProcessingStatus, labelQaqcResult } from "@/lib/procurement-labels";
import { getSession } from "@/services/auth/get-session";
import { getProcessingRun, listEligibleBatches } from "@/services/processing/processing-service";

export const metadata: Metadata = {
  title: "Processing Run",
};

export default async function ProcessingRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  // Time-dependent values (fresh window, today) must render at request time.
  await connection();
  const query = searchParams ? await searchParams : {};
  const run = await getProcessingRun(id);
  if (!run) notFound();
  const session = getSession();

  const openForCompletion = run.status === "draft" || run.status === "in_progress";
  const eligibleBatches = openForCompletion ? await listEligibleBatches() : [];
  const batchOption =
    eligibleBatches.find((batch) => batch.id === run.parentBatchId) ??
    (openForCompletion
      ? {
          id: run.parentBatchId,
          batchNumber: run.batchNumber,
          productSpecies: run.productSpecies,
          availableQuantity: run.inputQuantity,
          unit: run.unit,
          receivedAt: new Date().toISOString(),
          status: "active",
          freshUntil: new Date().toISOString(),
          freshStatus: "fresh" as const,
        }
      : null);

  return (
    <div className="space-y-4">
      <PageHeader
        title={run.processingRunNumber}
        description="Processing run detail, quantity summary, QAQC, and inventory impact."
      />

      {query.completed ? <Alert tone="success">Processing run completed successfully.</Alert> : null}
      {query.draft ? <Alert tone="success">Processing draft saved.</Alert> : null}
      {run.qaqc?.result === "failed" ? (
        <Alert tone="error">
          Processing QAQC failed. The run is preserved, but accepted processed inventory was not created.
        </Alert>
      ) : null}

      <Panel>
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[12px] text-ink-muted">Processing Run</dt>
            <dd className="mt-1 text-[13px] font-semibold">{run.processingRunNumber}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Parent Batch</dt>
            <dd className="mt-1 text-[13px]">
              <Link href={`/inventory/batches/${run.parentBatchId}`} className="text-primary-text hover:underline">
                {run.batchNumber}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Product</dt>
            <dd className="mt-1 text-[13px]">{run.productSpecies}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Processing Date</dt>
            <dd className="mt-1 text-[13px]">{run.processingDate}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Operator</dt>
            <dd className="mt-1 text-[13px]">{run.operatorName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Status</dt>
            <dd className="mt-1">
              <StatusBadge>{labelProcessingStatus(run.status)}</StatusBadge>
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Quantity summary">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5 text-[13px]">
          <div>
            <dt className="text-[12px] text-ink-muted">Input</dt>
            <dd className="mt-1 font-medium">{formatQuantity(run.inputQuantity, run.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Yield</dt>
            <dd className="mt-1 font-medium">
              {formatQuantity(run.yieldQuantity, run.unit)} · {formatPercent(run.yieldPercent)}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Wastage</dt>
            <dd className="mt-1 font-medium">
              {formatQuantity(run.wastageQuantity, run.unit)} · {formatPercent(run.wastagePercent)}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Yield %</dt>
            <dd className="mt-1">{formatPercent(run.yieldPercent)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Wastage %</dt>
            <dd className="mt-1">{formatPercent(run.wastagePercent)}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="QAQC">
        {run.qaqc ? (
          <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
            <div>
              <dt className="text-[12px] text-ink-muted">Inspection Date</dt>
              <dd className="mt-1">{run.qaqc.inspectionDate}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Result</dt>
              <dd className="mt-1">{labelQaqcResult(run.qaqc.result)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Status</dt>
              <dd className="mt-1">{run.qaqc.status}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Notes</dt>
              <dd className="mt-1">{run.qaqc.notes || "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No processing QAQC recorded yet.</p>
        )}
      </Panel>

      <Panel title="Inventory impact">
        <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 text-[13px]">
          <div>
            <dt className="text-[12px] text-ink-muted">Raw consumed</dt>
            <dd className="mt-1">{formatQuantity(run.inventoryImpact.rawConsumed, run.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Processed created</dt>
            <dd className="mt-1">{formatQuantity(run.inventoryImpact.processedCreated, run.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Wastage created</dt>
            <dd className="mt-1">{formatQuantity(run.inventoryImpact.wastageCreated, run.unit)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-muted">Inventory accepted</dt>
            <dd className="mt-1">{run.inventoryImpact.accepted ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </Panel>

      {run.notes ? (
        <Panel title="Notes">
          <p className="p-4 text-[13px] text-ink-secondary whitespace-pre-wrap">{run.notes}</p>
        </Panel>
      ) : null}

      <Panel title="Audit history">
        {run.audits.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Who</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Field</th>
                  <th className="px-4 py-2 font-medium">Previous</th>
                  <th className="px-4 py-2 font-medium">New</th>
                </tr>
              </thead>
              <tbody>
                {run.audits.map((audit) => (
                  <tr key={audit.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap">{formatTimestamp(audit.timestamp)}</td>
                    <td className="px-4 py-2">{audit.actorName}</td>
                    <td className="px-4 py-2">{audit.action}</td>
                    <td className="px-4 py-2">{audit.field ?? "—"}</td>
                    <td className="px-4 py-2">{audit.previousValue ?? "—"}</td>
                    <td className="px-4 py-2">{audit.newValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-[13px] text-ink-muted">No audit entries for this run yet.</p>
        )}
      </Panel>

      {openForCompletion && batchOption ? (
        <Can permission={PERMISSIONS.processingComplete}>
          <Panel title="Complete processing">
            <div className="p-4">
              <ProcessingForm
                completeAction={completeProcessingAction}
                draftAction={createProcessingDraftAction}
                batches={[batchOption]}
                defaultBatchId={run.parentBatchId}
                processingRunId={run.id}
                canComplete={
                  hasPermission(session.role, PERMISSIONS.processingComplete) &&
                  hasPermission(session.role, PERMISSIONS.processingQaqc)
                }
                canDraft={false}
                defaults={{
                  processingDate: run.processingDate,
                  operatorName: run.operatorName ?? "",
                  inputQuantity: run.inputQuantity,
                  unit: run.unit,
                  yieldQuantity: run.yieldQuantity,
                  wastageQuantity: run.wastageQuantity,
                  notes: run.notes ?? "",
                }}
              />
            </div>
          </Panel>
        </Can>
      ) : null}
    </div>
  );
}
