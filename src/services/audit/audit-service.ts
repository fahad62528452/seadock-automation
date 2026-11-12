import { sampleAuditLog } from "@/lib/mock/audit-log";
import { shouldUseSupabaseData } from "@/lib/data-source";
import type { AuditEntry, AuditQuery, AuditService, NewAuditEntry } from "@/types/audit";

let unpersistedSequence = 0;

async function recordAuditEntryMock(input: NewAuditEntry): Promise<AuditEntry> {
  unpersistedSequence += 1;

  return {
    ...input,
    id: `audit_unpersisted_${unpersistedSequence}`,
    timestamp: new Date().toISOString(),
  };
}

async function listAuditEntriesMock(query: AuditQuery = {}): Promise<AuditEntry[]> {
  "use cache";

  const limit = query.limit ?? sampleAuditLog.length;

  return sampleAuditLog
    .filter((entry) => {
      if (query.recordType && entry.recordType !== query.recordType) return false;
      if (query.recordId && entry.recordId !== query.recordId) return false;
      if (query.actorId && entry.actorId !== query.actorId) return false;
      return true;
    })
    .slice(0, limit);
}

/**
 * Accepts an audit entry.
 * Persists to PostgreSQL when SEADOCK_DATA_SOURCE=supabase; otherwise returns an unpersisted sample.
 */
export async function recordAuditEntry(input: NewAuditEntry): Promise<AuditEntry> {
  if (shouldUseSupabaseData()) {
    const { insertAuditLog } = await import("@/services/audit/audit-repository");
    return insertAuditLog(input);
  }

  return recordAuditEntryMock(input);
}

export async function listAuditEntries(query: AuditQuery = {}): Promise<AuditEntry[]> {
  if (shouldUseSupabaseData()) {
    const { queryAuditLogs } = await import("@/services/audit/audit-repository");
    return queryAuditLogs(query);
  }

  return listAuditEntriesMock(query);
}

export const auditService: AuditService = {
  record: recordAuditEntry,
  list: listAuditEntries,
};
