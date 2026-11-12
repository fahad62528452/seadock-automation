export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  recordType: string;
  recordId: string;
  recordLabel: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  timestamp: string;
}

export type NewAuditEntry = Omit<AuditEntry, "id" | "timestamp">;

export interface AuditQuery {
  recordType?: string;
  recordId?: string;
  actorId?: string;
  limit?: number;
}

export interface AuditService {
  record(input: NewAuditEntry): Promise<AuditEntry>;
  list(query?: AuditQuery): Promise<AuditEntry[]>;
}
