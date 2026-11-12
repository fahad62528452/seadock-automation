import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AuditEntry, AuditQuery, NewAuditEntry } from "@/types/audit";
import type { PublicRow } from "@/types/database";

type AuditLogRow = PublicRow<"audit_logs">;

function mapAuditRow(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    actorId: row.user_id ?? "unknown",
    actorName: row.actor_name,
    action: row.action,
    recordType: row.entity_type,
    recordId: row.entity_id,
    recordLabel: row.entity_label ?? row.entity_id,
    field: row.field_name,
    previousValue: row.previous_value,
    newValue: row.new_value,
    timestamp: row.created_at,
  };
}

async function getWritableClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return createAdminSupabaseClient();
  }
  return createServerSupabaseClient();
}

export async function insertAuditLog(input: NewAuditEntry): Promise<AuditEntry> {
  const client = await getWritableClient();

  const { data, error } = await client
    .from("audit_logs")
    .insert({
      user_id: input.actorId || null,
      actor_name: input.actorName,
      action: input.action,
      entity_type: input.recordType,
      entity_id: input.recordId,
      entity_label: input.recordLabel,
      field_name: input.field,
      previous_value: input.previousValue,
      new_value: input.newValue,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to persist audit log: ${error.message}`);
  }

  return mapAuditRow(data);
}

export async function queryAuditLogs(query: AuditQuery = {}): Promise<AuditEntry[]> {
  const client = await createServerSupabaseClient();
  const limit = query.limit ?? 50;

  let request = client
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.recordType) {
    request = request.eq("entity_type", query.recordType);
  }
  if (query.recordId) {
    request = request.eq("entity_id", query.recordId);
  }
  if (query.actorId) {
    request = request.eq("user_id", query.actorId);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Failed to load audit logs: ${error.message}`);
  }

  return (data ?? []).map(mapAuditRow);
}
