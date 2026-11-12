import type { Metadata } from "next";
import { connection } from "next/server";
import { completeProcessingAction, createProcessingDraftAction } from "@/app/(shell)/processing/actions";
import { ProcessingForm } from "@/components/processing/processing-form";
import { Alert, PageHeader } from "@/components/ui/form";
import { Panel } from "@/components/ui/panel";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSession } from "@/services/auth/get-session";
import { listEligibleBatches } from "@/services/processing/processing-service";

export const metadata: Metadata = {
  title: "New Processing Run",
};

export default async function NewProcessingRunPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  // Time-dependent values (fresh window, today) must render at request time.
  await connection();
  const batchParam = params.batch;
  const defaultBatchId = typeof batchParam === "string" ? batchParam : undefined;
  const batches = await listEligibleBatches();
  const session = getSession();

  return (
    <div>
      <PageHeader
        title="New Processing Run"
        description="Select a parent batch, enter processing quantities, and record processing QAQC."
      />
      {!batches.length ? (
        <Alert tone="info">
          No eligible batches with available raw inventory were found. Receive and accept a batch before processing.
        </Alert>
      ) : (
        <Panel>
          <div className="p-4">
            <ProcessingForm
              completeAction={completeProcessingAction}
              draftAction={createProcessingDraftAction}
              batches={batches}
              defaultBatchId={defaultBatchId}
              canComplete={
                hasPermission(session.role, PERMISSIONS.processingComplete) &&
                hasPermission(session.role, PERMISSIONS.processingQaqc)
              }
              canDraft={hasPermission(session.role, PERMISSIONS.processingManage)}
              defaults={{ operatorName: session.name }}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
