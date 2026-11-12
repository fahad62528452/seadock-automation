"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission, toUserMessage } from "@/lib/authz";
import { completeProcessing, createProcessingDraft } from "@/services/processing/processing-service";
import type { ProcessingRunInput } from "@/types/processing";
import type { QaqcResult } from "@/types/database";

export type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseInput(formData: FormData): ProcessingRunInput {
  return {
    parentBatchId: formString(formData, "parentBatchId"),
    processingDate: formString(formData, "processingDate"),
    operatorName: formString(formData, "operatorName"),
    inputQuantity: Number(formString(formData, "inputQuantity") || "0"),
    unit: formString(formData, "unit") || "kg",
    yieldQuantity: Number(formString(formData, "yieldQuantity") || "0"),
    wastageQuantity: Number(formString(formData, "wastageQuantity") || "0"),
    notes: formString(formData, "notes"),
    processingRunId: formString(formData, "processingRunId") || undefined,
    qaqc: {
      inspectionDate: formString(formData, "inspectionDate"),
      result: formString(formData, "qaqcResult") as Extract<QaqcResult, "passed" | "failed" | "conditional">,
      notes: formString(formData, "qaqcNotes"),
    },
  };
}

export async function createProcessingDraftAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let processingRunId = "";

  try {
    requirePermission(PERMISSIONS.processingManage);
    const input = parseInput(formData);
    const result = await createProcessingDraft(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    processingRunId = result.data.processingRunId;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to save processing draft.") };
  }

  revalidatePath("/processing");
  revalidatePath("/processing/runs");
  redirect(`/processing/${processingRunId}?draft=1`);
}

export async function completeProcessingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let processingRunId = "";

  try {
    requirePermission(PERMISSIONS.processingComplete);
    requirePermission(PERMISSIONS.processingQaqc);
    const input = parseInput(formData);
    const result = await completeProcessing(input);
    if (!result.ok) return { ok: false, message: result.error, fieldErrors: result.fieldErrors };
    processingRunId = result.data.processingRunId;
  } catch (error) {
    return { ok: false, message: toUserMessage(error, "Unable to complete processing.") };
  }

  revalidatePath("/processing");
  revalidatePath("/processing/runs");
  revalidatePath("/inventory/batches");
  revalidatePath("/inventory");
  revalidatePath("/audit");
  redirect(`/processing/${processingRunId}?completed=1`);
}
