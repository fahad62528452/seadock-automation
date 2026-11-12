import type { ProcessingRunDbStatus, QaqcResult } from "@/types/database";
import type { FreshWindowStatus, ServiceResult } from "@/types/procurement";

export type ProcessingRunStatus = ProcessingRunDbStatus;

export interface EligibleBatchOption {
  id: string;
  batchNumber: string;
  productSpecies: string;
  availableQuantity: number;
  unit: string;
  receivedAt: string;
  status: string;
  freshUntil: string;
  freshStatus: FreshWindowStatus;
}

export interface ProcessingRunInput {
  parentBatchId: string;
  processingDate: string;
  operatorName: string;
  inputQuantity: number;
  unit: string;
  yieldQuantity: number;
  wastageQuantity: number;
  notes: string;
  qaqc: {
    inspectionDate: string;
    result: Extract<QaqcResult, "passed" | "failed" | "conditional">;
    notes: string;
  };
  processingRunId?: string;
  saveAsDraft?: boolean;
}

export interface ProcessingRunListItem {
  id: string;
  processingRunNumber: string;
  parentBatchId: string;
  batchNumber: string;
  productSpecies: string;
  inputQuantity: number;
  yieldQuantity: number;
  wastageQuantity: number;
  yieldPercent: number | null;
  wastagePercent: number | null;
  unit: string;
  processingDate: string;
  status: ProcessingRunStatus;
  operatorName: string | null;
  qaqcResult: string | null;
  inventoryAccepted: boolean;
}

export interface ProcessingRunDetail {
  id: string;
  processingRunNumber: string;
  parentBatchId: string;
  batchNumber: string;
  productSpecies: string;
  processingDate: string;
  operatorName: string | null;
  status: ProcessingRunStatus;
  notes: string | null;
  inputQuantity: number;
  yieldQuantity: number;
  wastageQuantity: number;
  yieldPercent: number | null;
  wastagePercent: number | null;
  unit: string;
  qaqc: {
    id: string;
    inspectionDate: string;
    result: string | null;
    notes: string | null;
    status: string;
  } | null;
  inventoryImpact: {
    rawConsumed: number;
    processedCreated: number;
    wastageCreated: number;
    accepted: boolean;
  };
  audits: Array<{
    id: string;
    actorName: string;
    action: string;
    field: string | null;
    previousValue: string | null;
    newValue: string | null;
    timestamp: string;
  }>;
}

export interface BatchProcessingHistoryItem {
  id: string;
  processingRunNumber: string;
  processingDate: string;
  inputQuantity: number;
  yieldQuantity: number;
  wastageQuantity: number;
  unit: string;
  status: ProcessingRunStatus;
  qaqcResult: string | null;
}

export type { ServiceResult };
