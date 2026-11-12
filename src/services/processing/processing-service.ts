import "server-only";

import { asProfileId } from "@/lib/authz";
import { getFreshUntil, getFreshWindowStatus } from "@/lib/fresh-window";
import {
  mockCompleteProcessing,
  mockCreateProcessingDraft,
  mockGetProcessingRun,
  mockListBatchProcessingHistory,
  mockListEligibleBatches,
  mockListProcessingRuns,
} from "@/lib/mock/procurement-store";
import { normalizeProcessingQuantities, validateProcessingInput } from "@/lib/processing-validation";
import { percentOf, roundQuantity } from "@/lib/quantity";
import { getSession } from "@/services/auth/get-session";
import { getDatabaseClient, getPersistenceMode } from "@/services/db/client";
import type {
  EligibleBatchOption,
  ProcessingRunDetail,
  ProcessingRunInput,
  ProcessingRunListItem,
  ServiceResult,
} from "@/types/processing";

function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

function fail<T = never>(error: string, fieldErrors?: Record<string, string>): ServiceResult<T> {
  return { ok: false, error, fieldErrors };
}

type NestedRow = {
  [key: string]: unknown;
};

async function getClient(preferAdmin = true) {
  const database = await getDatabaseClient({ preferAdmin });
  if (!database) throw new Error("Supabase is not configured.");
  return database.client;
}

function cleanRpcMessage(message: string): string {
  return message.replace(/^.*exception:\s*/i, "") || "Unable to complete processing.";
}

export async function listEligibleBatches(): Promise<EligibleBatchOption[]> {
  if (getPersistenceMode() === "mock") return mockListEligibleBatches();

  const client = await getClient();
  const { data, error } = await client
    .from("batches")
    .select("id, batch_number, product_species, remaining_quantity, unit, received_at, status, inventory_items(id, quantity, inventory_type, status, unit)")
    .not("status", "in", "(archived,dispatched)")
    .order("batch_number");

  if (error) throw new Error("Unable to load eligible batches.");

  return ((data ?? []) as NestedRow[])
    .map((batch) => {
      const inventories = (Array.isArray(batch.inventory_items) ? batch.inventory_items : []) as NestedRow[];
      const raw = inventories.find(
        (row) => row.inventory_type === "raw" && row.status === "available",
      );
      const available = raw ? roundQuantity(Number(raw.quantity)) : 0;
      if (available <= 0) return null;
      const receivedAt = batch.received_at as string;
      return {
        id: batch.id as string,
        batchNumber: batch.batch_number as string,
        productSpecies: batch.product_species as string,
        availableQuantity: available,
        unit: (raw?.unit as string | undefined) ?? (batch.unit as string),
        receivedAt,
        status: batch.status as string,
        freshUntil: getFreshUntil(receivedAt),
        freshStatus: getFreshWindowStatus(receivedAt),
      } satisfies EligibleBatchOption;
    })
    .filter((row): row is EligibleBatchOption => Boolean(row));
}

export async function listProcessingRuns(): Promise<ProcessingRunListItem[]> {
  if (getPersistenceMode() === "mock") return mockListProcessingRuns();

  const client = await getClient();
  const { data, error } = await client
    .from("processing_runs")
    .select(
      "id, processing_run_number, parent_batch_id, processing_date, input_quantity, input_unit, processed_quantity, wastage_quantity, status, operator_name, batches(batch_number, product_species), processing_qaqc(result), inventory_items(id, inventory_type)",
    )
    .order("processing_date", { ascending: false });

  if (error) throw new Error("Unable to load processing runs.");

  return ((data ?? []) as NestedRow[]).map((run) => {
    const batch = Array.isArray(run.batches) ? run.batches[0] : run.batches;
    const qaqc = Array.isArray(run.processing_qaqc) ? run.processing_qaqc[0] : run.processing_qaqc;
    const inventories = (Array.isArray(run.inventory_items) ? run.inventory_items : []) as NestedRow[];
    const inputQuantity = Number(run.input_quantity);
    const yieldQuantity = Number(run.processed_quantity);
    const wastageQuantity = Number(run.wastage_quantity);
    return {
      id: run.id as string,
      processingRunNumber: run.processing_run_number as string,
      parentBatchId: run.parent_batch_id as string,
      batchNumber: (batch?.batch_number as string | undefined) ?? "—",
      productSpecies: (batch?.product_species as string | undefined) ?? "—",
      inputQuantity,
      yieldQuantity,
      wastageQuantity,
      yieldPercent: percentOf(yieldQuantity, inputQuantity),
      wastagePercent: percentOf(wastageQuantity, inputQuantity),
      unit: run.input_unit as string,
      processingDate: run.processing_date as string,
      status: run.status as ProcessingRunListItem["status"],
      operatorName: (run.operator_name as string | null) ?? null,
      qaqcResult: (qaqc?.result as string | null | undefined) ?? null,
      inventoryAccepted: inventories.some((row) => row.inventory_type === "processed" || row.inventory_type === "wastage"),
    };
  });
}

export async function getProcessingRun(id: string): Promise<ProcessingRunDetail | null> {
  if (getPersistenceMode() === "mock") return mockGetProcessingRun(id);

  const client = await getClient();
  const { data, error } = await client
    .from("processing_runs")
    .select(
      "*, batches(batch_number, product_species), processing_qaqc(*), inventory_items(id, inventory_type, quantity)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load processing run.");
  if (!data) return null;

  const row = data as NestedRow;
  const batch = Array.isArray(row.batches) ? row.batches[0] : row.batches;
  const qaqcRow = Array.isArray(row.processing_qaqc) ? row.processing_qaqc[0] : row.processing_qaqc;
  const inventories = (Array.isArray(row.inventory_items) ? row.inventory_items : []) as NestedRow[];
  const processed = inventories.find((item) => item.inventory_type === "processed");
  const wastage = inventories.find((item) => item.inventory_type === "wastage");
  const accepted = Boolean(processed || wastage);
  const inputQuantity = Number(row.input_quantity);
  const yieldQuantity = Number(row.processed_quantity);
  const wastageQuantity = Number(row.wastage_quantity);

  const { data: audits } = await client
    .from("audit_logs")
    .select("id, actor_name, action, field_name, previous_value, new_value, created_at, entity_label")
    .or(`entity_id.eq.${id},entity_label.eq.${row.processing_run_number as string}`)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    id: row.id as string,
    processingRunNumber: row.processing_run_number as string,
    parentBatchId: row.parent_batch_id as string,
    batchNumber: (batch?.batch_number as string | undefined) ?? "—",
    productSpecies: (batch?.product_species as string | undefined) ?? "—",
    processingDate: row.processing_date as string,
    operatorName: (row.operator_name as string | null) ?? null,
    status: row.status as ProcessingRunDetail["status"],
    notes: (row.notes as string | null) ?? null,
    inputQuantity,
    yieldQuantity,
    wastageQuantity,
    yieldPercent: percentOf(yieldQuantity, inputQuantity),
    wastagePercent: percentOf(wastageQuantity, inputQuantity),
    unit: row.input_unit as string,
    qaqc: qaqcRow
      ? {
          id: qaqcRow.id as string,
          inspectionDate: qaqcRow.inspection_date as string,
          result: (qaqcRow.result as string | null) ?? null,
          notes: (qaqcRow.notes as string | null) ?? null,
          status: qaqcRow.status as string,
        }
      : null,
    inventoryImpact: {
      rawConsumed: accepted ? inputQuantity : 0,
      processedCreated: processed ? Number(processed.quantity) : 0,
      wastageCreated: wastage ? Number(wastage.quantity) : 0,
      accepted,
    },
    audits: ((audits ?? []) as NestedRow[]).map((audit) => ({
      id: audit.id as string,
      actorName: audit.actor_name as string,
      action: audit.action as string,
      field: (audit.field_name as string | null) ?? null,
      previousValue: (audit.previous_value as string | null) ?? null,
      newValue: (audit.new_value as string | null) ?? null,
      timestamp: audit.created_at as string,
    })),
  };
}

export async function listProcessingHistoryForBatch(batchId: string) {
  if (getPersistenceMode() === "mock") return mockListBatchProcessingHistory(batchId);

  const client = await getClient();
  const { data, error } = await client
    .from("processing_runs")
    .select("id, processing_run_number, processing_date, input_quantity, processed_quantity, wastage_quantity, input_unit, status, processing_qaqc(result)")
    .eq("parent_batch_id", batchId)
    .order("processing_date", { ascending: false });

  if (error) throw new Error("Unable to load batch processing history.");

  return ((data ?? []) as NestedRow[]).map((run) => {
    const qaqc = Array.isArray(run.processing_qaqc) ? run.processing_qaqc[0] : run.processing_qaqc;
    return {
      id: run.id as string,
      processingRunNumber: run.processing_run_number as string,
      processingDate: run.processing_date as string,
      inputQuantity: Number(run.input_quantity),
      yieldQuantity: Number(run.processed_quantity),
      wastageQuantity: Number(run.wastage_quantity),
      unit: run.input_unit as string,
      status: run.status as string,
      qaqcResult: (qaqc?.result as string | null | undefined) ?? null,
    };
  });
}

export async function createProcessingDraft(
  input: ProcessingRunInput,
): Promise<ServiceResult<{ processingRunId: string; processingRunNumber: string }>> {
  const quantities = normalizeProcessingQuantities(input);
  const fieldErrors = validateProcessingInput({ ...input, ...quantities, saveAsDraft: true });
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockCreateProcessingDraft({ ...input, ...quantities, saveAsDraft: true }, session.name);
      return ok({ processingRunId: result.processingRunId, processingRunNumber: result.processingRunNumber });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to save draft processing run.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("create_processing_run_draft", {
    p_parent_batch_id: input.parentBatchId,
    p_processing_date: input.processingDate,
    p_operator_name: input.operatorName.trim(),
    p_input_quantity: quantities.inputQuantity,
    p_input_unit: input.unit.trim() || "kg",
    p_notes: input.notes.trim(),
    p_processed_by: asProfileId(session.id),
    p_actor_name: session.name,
  });

  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    processingRunId: String(payload.processing_run_id ?? ""),
    processingRunNumber: String(payload.processing_run_number ?? ""),
  });
}

export async function completeProcessing(
  input: ProcessingRunInput,
): Promise<ServiceResult<{ processingRunId: string; processingRunNumber: string; accepted: boolean }>> {
  const quantities = normalizeProcessingQuantities(input);
  const fieldErrors = validateProcessingInput({ ...input, ...quantities, saveAsDraft: false });
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted fields.", fieldErrors);

  const session = getSession();

  if (getPersistenceMode() === "mock") {
    try {
      const result = mockCompleteProcessing({ ...input, ...quantities }, session.name);
      return ok(result);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Unable to complete processing.");
    }
  }

  const client = await getClient(true);
  const { data, error } = await client.rpc("complete_processing_workflow", {
    p_parent_batch_id: input.parentBatchId,
    p_processing_date: input.processingDate,
    p_operator_name: input.operatorName.trim(),
    p_input_quantity: quantities.inputQuantity,
    p_input_unit: input.unit.trim() || "kg",
    p_yield_quantity: quantities.yieldQuantity,
    p_wastage_quantity: quantities.wastageQuantity,
    p_notes: input.notes.trim(),
    p_processed_by: asProfileId(session.id),
    p_actor_name: session.name,
    p_qaqc_inspection_date: input.qaqc.inspectionDate,
    p_qaqc_inspector_id: asProfileId(session.id),
    p_qaqc_result: input.qaqc.result,
    p_qaqc_notes: input.qaqc.notes.trim(),
    p_processing_run_id: input.processingRunId || null,
  });

  if (error) return fail(cleanRpcMessage(error.message));
  const payload = (data ?? {}) as NestedRow;
  return ok({
    processingRunId: String(payload.processing_run_id ?? ""),
    processingRunNumber: String(payload.processing_run_number ?? ""),
    accepted: Boolean(payload.accepted),
  });
}
