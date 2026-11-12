import type { Metadata } from "next";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatTimestamp } from "@/lib/format";
import { listAuditEntries } from "@/services/audit/audit-service";
import type { AuditEntry } from "@/types/audit";

export const metadata: Metadata = {
  title: "Audit History",
};

function valueOrDash(value: string | null): string {
  return value ?? "—";
}

export default async function AuditPage() {
  const entries = await listAuditEntries();

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ink-muted">
        Sample history showing the fields that will be stored. Nothing here is saved yet.
      </p>
      <Panel title="Audit history">
        <DataTable<AuditEntry>
          caption="Audit history"
          columns={[
            {
              id: "time",
              header: "Time",
              className: "whitespace-nowrap text-ink-secondary",
              cell: (row) => formatTimestamp(row.timestamp),
            },
            { id: "user", header: "User", className: "whitespace-nowrap", cell: (row) => row.actorName },
            { id: "action", header: "Action", className: "whitespace-nowrap", cell: (row) => row.action },
            { id: "record", header: "Record", className: "whitespace-nowrap", cell: (row) => row.recordLabel },
            { id: "field", header: "Field", className: "whitespace-nowrap", cell: (row) => valueOrDash(row.field) },
            { id: "previous", header: "Previous", className: "whitespace-nowrap", cell: (row) => valueOrDash(row.previousValue) },
            { id: "next", header: "New", className: "whitespace-nowrap", cell: (row) => valueOrDash(row.newValue) },
          ]}
          rows={entries}
          getRowKey={(row) => row.id}
          emptyTitle="No audit history yet"
          emptyDescription="Changes to operational records will be listed here once audit storage is connected."
        />
      </Panel>
    </div>
  );
}
