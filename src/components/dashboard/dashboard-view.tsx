import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { StatusText } from "@/components/ui/status-text";
import type { ActivityView, DashboardSummary, PendingActionView } from "@/types/dashboard";

const ATTENTION_IDS = [
  "pending-customer-pos",
  "pos-awaiting-allocation",
  "fulfilments-awaiting-qaqc",
  "fulfilments-ready-for-dispatch",
  "available-inventory",
  "reserved-inventory",
] as const;

export function DashboardView({ summary }: { summary: DashboardSummary }) {
  const byId = new Map(summary.cards.map((card) => [card.id, card]));
  const attentionCards = ATTENTION_IDS.map((id) => byId.get(id)).filter(
    (card): card is NonNullable<typeof card> => Boolean(card),
  );

  return (
    <div className="space-y-4">
      <section aria-labelledby="attention-heading">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="attention-heading" className="text-[13px] font-semibold text-ink">
            Needs attention
          </h2>
          <p className="text-[11px] text-ink-muted">PO → allocate → QAQC → dispatch</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {attentionCards.map((card) => (
            <StatCard
              key={card.id}
              label={card.label}
              value={card.value}
              detail={card.detail}
              href={card.href}
              emphasis={["pos-awaiting-allocation", "fulfilments-ready-for-dispatch"].includes(card.id)}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Pending actions" description="Work that should move next in the fulfilment chain.">
          <DataTable<PendingActionView>
            caption="Pending actions"
            columns={[
              {
                id: "status",
                header: "Status",
                cell: (row) => <StatusText label={row.statusLabel} tone={row.tone} />,
              },
              {
                id: "reference",
                header: "Reference",
                className: "whitespace-nowrap",
                cell: (row) => (
                  <Link href={row.href} className="font-medium text-primary-text hover:underline">
                    {row.reference}
                  </Link>
                ),
              },
              {
                id: "detail",
                header: "Detail",
                cell: (row) => <span className="text-ink-secondary">{row.detail}</span>,
              },
              {
                id: "since",
                header: "Since",
                className: "whitespace-nowrap text-ink-muted",
                cell: (row) => row.since,
              },
            ]}
            rows={summary.pendingActions}
            getRowKey={(row) => row.id}
            emptyTitle="No pending actions"
            emptyDescription="Items that need attention will appear here."
          />
        </Panel>

        <Panel title="Recent activity">
          <DataTable<ActivityView>
            caption="Recent activity"
            columns={[
              {
                id: "time",
                header: "Time",
                className: "whitespace-nowrap text-ink-muted",
                cell: (row) => row.time,
              },
              { id: "action", header: "Action", cell: (row) => row.action },
              {
                id: "record",
                header: "Record",
                className: "whitespace-nowrap",
                cell: (row) => row.record,
              },
            ]}
            rows={summary.recentActivity}
            getRowKey={(row) => row.id}
            emptyTitle="No recent activity"
            emptyDescription="Record changes appear here once audit history is connected."
          />
        </Panel>
      </div>
    </div>
  );
}
