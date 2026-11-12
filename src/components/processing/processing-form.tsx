"use client";

import { useActionState, useMemo, useState } from "react";
import { Alert, Button, FormArea, FormField, FormInput, FormSelect, StatusBadge } from "@/components/ui/form";
import type { ActionState } from "@/app/(shell)/processing/actions";
import { formatPercent, formatQuantity, labelProcessingStatus } from "@/lib/procurement-labels";
import { percentOf, quantitiesEqual, roundQuantity } from "@/lib/quantity";
import { freshWindowLabel } from "@/lib/fresh-window";
import { formatTimestamp } from "@/lib/format";
import type { EligibleBatchOption } from "@/types/processing";

const initialState: ActionState = { ok: false };

export function ProcessingForm({
  completeAction,
  draftAction,
  batches,
  defaultBatchId,
  processingRunId,
  canComplete = true,
  canDraft = true,
  defaults,
}: {
  completeAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  draftAction: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  batches: EligibleBatchOption[];
  defaultBatchId?: string;
  processingRunId?: string;
  canComplete?: boolean;
  canDraft?: boolean;
  defaults?: {
    processingDate?: string;
    operatorName?: string;
    inputQuantity?: number;
    unit?: string;
    yieldQuantity?: number;
    wastageQuantity?: number;
    notes?: string;
  };
}) {
  const [completeState, completeFormAction, completePending] = useActionState(completeAction, initialState);
  const [draftState, draftFormAction, draftPending] = useActionState(draftAction, initialState);
  const state = completeState.message || completeState.fieldErrors ? completeState : draftState;
  const pending = completePending || draftPending;

  const [batchId, setBatchId] = useState(defaultBatchId ?? batches[0]?.id ?? "");
  const selected = useMemo(() => batches.find((batch) => batch.id === batchId) ?? null, [batchId, batches]);

  const [inputQuantity, setInputQuantity] = useState(String(defaults?.inputQuantity ?? ""));
  const [yieldQuantity, setYieldQuantity] = useState(String(defaults?.yieldQuantity ?? ""));
  const [wastageQuantity, setWastageQuantity] = useState(String(defaults?.wastageQuantity ?? ""));

  const inputQty = roundQuantity(Number(inputQuantity) || 0);
  const yieldQty = roundQuantity(Number(yieldQuantity) || 0);
  const wastageQty = roundQuantity(Number(wastageQuantity) || 0);
  const totalOut = roundQuantity(yieldQty + wastageQty);
  const reconciled = inputQty > 0 && quantitiesEqual(inputQty, totalOut);
  const yieldPct = percentOf(yieldQty, inputQty);
  const wastagePct = percentOf(wastageQty, inputQty);
  const overAvailable = selected ? inputQty > selected.availableQuantity : false;

  return (
    <form className="space-y-5">
      {processingRunId ? <input type="hidden" name="processingRunId" value={processingRunId} /> : null}
      {state.message ? <Alert tone="error">{state.message}</Alert> : null}
      {state.fieldErrors?.reconciliation ? <Alert tone="error">{state.fieldErrors.reconciliation}</Alert> : null}

      <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-[13px] text-ink-secondary">
        <p className="font-medium text-ink">Parent Batch → Processing → Yield + Wastage → Processing QAQC → Inventory</p>
        <p className="mt-1">
          Completion requires Input = Yield + Wastage. Accepted processed and wastage inventory are created only when
          processing QAQC is Passed or Conditional.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Parent Batch" htmlFor="parentBatchId" required error={state.fieldErrors?.parentBatchId}>
          <FormSelect
            id="parentBatchId"
            name="parentBatchId"
            required
            value={batchId}
            onChange={(event) => setBatchId(event.target.value)}
            disabled={Boolean(processingRunId)}
          >
            <option value="" disabled>
              Select parent batch
            </option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.batchNumber} — {batch.productSpecies} ({formatQuantity(batch.availableQuantity, batch.unit)} available)
              </option>
            ))}
          </FormSelect>
        </FormField>
        <FormField label="Processing Date" htmlFor="processingDate" required error={state.fieldErrors?.processingDate}>
          <FormInput
            id="processingDate"
            name="processingDate"
            type="date"
            required
            defaultValue={defaults?.processingDate ?? new Date().toISOString().slice(0, 10)}
          />
        </FormField>
        <FormField label="Processing Operator" htmlFor="operatorName" required error={state.fieldErrors?.operatorName}>
          <FormInput id="operatorName" name="operatorName" required defaultValue={defaults?.operatorName ?? ""} />
        </FormField>
        <FormField label="Unit" htmlFor="unit" required error={state.fieldErrors?.unit}>
          <FormInput id="unit" name="unit" required defaultValue={defaults?.unit ?? selected?.unit ?? "kg"} />
        </FormField>
      </div>

      {selected ? (
        <div className="rounded-md border border-border p-4">
          <h3 className="text-[13px] font-semibold text-ink">Selected Batch</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-[13px]">
            <div>
              <dt className="text-[12px] text-ink-muted">Batch Number</dt>
              <dd className="mt-1 font-medium">{selected.batchNumber}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Product / Species</dt>
              <dd className="mt-1">{selected.productSpecies}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Available Quantity</dt>
              <dd className="mt-1">{formatQuantity(selected.availableQuantity, selected.unit)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Received Date</dt>
              <dd className="mt-1">{formatTimestamp(selected.receivedAt)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-ink-muted">Current Status</dt>
              <dd className="mt-1 flex flex-wrap gap-2">
                <StatusBadge>{selected.status}</StatusBadge>
                <StatusBadge>{freshWindowLabel(selected.freshStatus)}</StatusBadge>
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <Alert tone="info">Select a parent batch with available raw inventory.</Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Input Quantity" htmlFor="inputQuantity" required error={state.fieldErrors?.inputQuantity}>
          <FormInput
            id="inputQuantity"
            name="inputQuantity"
            type="number"
            step="0.001"
            min="0"
            required
            value={inputQuantity}
            onChange={(event) => setInputQuantity(event.target.value)}
          />
        </FormField>
        <FormField label="Yield Quantity" htmlFor="yieldQuantity" required error={state.fieldErrors?.yieldQuantity}>
          <FormInput
            id="yieldQuantity"
            name="yieldQuantity"
            type="number"
            step="0.001"
            min="0"
            required
            value={yieldQuantity}
            onChange={(event) => setYieldQuantity(event.target.value)}
          />
        </FormField>
        <FormField label="Wastage Quantity" htmlFor="wastageQuantity" required error={state.fieldErrors?.wastageQuantity}>
          <FormInput
            id="wastageQuantity"
            name="wastageQuantity"
            type="number"
            step="0.001"
            min="0"
            required
            value={wastageQuantity}
            onChange={(event) => setWastageQuantity(event.target.value)}
          />
        </FormField>
      </div>

      <div className="rounded-md border border-border p-4">
        <h3 className="text-[13px] font-semibold text-ink">Quantity Reconciliation</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 text-center text-[13px]">
          <div className="rounded-md bg-surface-muted px-3 py-4">
            <p className="text-[12px] text-ink-muted uppercase tracking-wide">Input</p>
            <p className="mt-2 text-[18px] font-semibold text-ink">{formatQuantity(inputQty, selected?.unit ?? "kg")}</p>
          </div>
          <div className="rounded-md bg-surface-muted px-3 py-4">
            <p className="text-[12px] text-ink-muted uppercase tracking-wide">Yield</p>
            <p className="mt-2 text-[18px] font-semibold text-ink">{formatQuantity(yieldQty, selected?.unit ?? "kg")}</p>
            <p className="mt-1 text-ink-secondary">{formatPercent(yieldPct)}</p>
          </div>
          <div className="rounded-md bg-surface-muted px-3 py-4">
            <p className="text-[12px] text-ink-muted uppercase tracking-wide">Wastage</p>
            <p className="mt-2 text-[18px] font-semibold text-ink">{formatQuantity(wastageQty, selected?.unit ?? "kg")}</p>
            <p className="mt-1 text-ink-secondary">{formatPercent(wastagePct)}</p>
          </div>
        </div>
        <p className={`mt-4 text-[13px] font-medium ${reconciled ? "text-primary-text" : "text-warning"}`}>
          {reconciled
            ? `✓ TOTAL = ${formatQuantity(totalOut, selected?.unit ?? "kg")}`
            : `Yield + Wastage = ${formatQuantity(totalOut, selected?.unit ?? "kg")} (must equal input)`}
        </p>
        {overAvailable ? (
          <p className="mt-2 text-[13px] text-warning">Processing quantity cannot exceed available batch inventory.</p>
        ) : null}
      </div>

      <FormField label="Notes" htmlFor="notes">
        <FormArea id="notes" name="notes" rows={3} defaultValue={defaults?.notes ?? ""} />
      </FormField>

      <div className="space-y-3 rounded-md border border-border p-4">
        <h3 className="text-[13px] font-semibold text-ink">Processing QAQC</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Inspection Date" htmlFor="inspectionDate" required error={state.fieldErrors?.inspectionDate}>
            <FormInput
              id="inspectionDate"
              name="inspectionDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </FormField>
          <FormField label="Result" htmlFor="qaqcResult" required error={state.fieldErrors?.qaqcResult}>
            <FormSelect id="qaqcResult" name="qaqcResult" required defaultValue="passed">
              <option value="passed">Passed</option>
              <option value="conditional">Conditional</option>
              <option value="failed">Failed</option>
            </FormSelect>
          </FormField>
        </div>
        <FormField label="QAQC Notes" htmlFor="qaqcNotes">
          <FormArea id="qaqcNotes" name="qaqcNotes" rows={2} />
        </FormField>
        <p className="text-[12px] text-ink-muted">
          Failed QAQC preserves the processing and QAQC records but does not create accepted processed inventory.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {canComplete ? (
          <Button formAction={completeFormAction} disabled={pending || !reconciled || overAvailable || !selected}>
            {completePending ? "Completing…" : "Complete Processing"}
          </Button>
        ) : null}
        {canDraft && !processingRunId ? (
          <Button formAction={draftFormAction} variant="secondary" disabled={pending || !selected || inputQty <= 0}>
            {draftPending ? "Saving…" : "Save Draft"}
          </Button>
        ) : null}
      </div>
      {!reconciled && inputQty > 0 ? (
        <p className="text-[12px] text-ink-muted">Complete remains disabled until Input = Yield + Wastage.</p>
      ) : null}
      {selected ? (
        <p className="text-[12px] text-ink-muted">
          Draft status for unfinished runs: {labelProcessingStatus("draft")}. Inventory is created only on successful
          completion with Passed/Conditional QAQC.
        </p>
      ) : null}
    </form>
  );
}
