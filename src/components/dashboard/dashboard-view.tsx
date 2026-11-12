import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { StatusText } from "@/components/ui/status-text";
import type { ActivityView, DashboardSummary, PendingActionView } from "@/types/dashboard";

const FULFILLMENT_CARD_IDS = [
  "pos-awaiting-allocation",
  "pos-partially-allocated",
  "pos-ready-for-fulfillment",
  "fulfilments-awaiting-qaqc",
  "fulfilments-ready-for-dispatch",
  "pos-partially-fulfilled",
];

export function DashboardView({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="space-y-5">
      <p className="text-[12px] text-ink-muted">
        Customer PO attention metrics use live/mock customer-order data. Other figures remain sample until their
        modules are connected.
      </p>

      <section aria-labelledby="customer-po-heading">
        <h2 id="customer-po-heading" className="mb-2 text-[13px] font-semibold text-ink">
          Customer PO attention
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.cards
            .filter((card) =>
              ["pending-customer-pos", "action-required-customer-pos", "urgent-customer-pos", "due-soon-customer-pos"].includes(
                card.id,
              ),
            )
            .map((card) => (
              <StatCard key={card.id} label={card.label} value={card.value} detail={card.detail} href={card.href} />
            ))}
        </div>
      </section>

      <section aria-labelledby="fulfillment-heading">
        <h2 id="fulfillment-heading" className="mb-2 text-[13px] font-semibold text-ink">
          Allocation and fulfilment
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {summary.cards
            .filter((card) => FULFILLMENT_CARD_IDS.includes(card.id))
            .map((card) => (
              <StatCard key={card.id} label={card.label} value={card.value} detail={card.detail} href={card.href} />
            ))}
        </div>
      </section>

      <section aria-labelledby="email-po-heading">
        <h2 id="email-po-heading" className="mb-2 text-[13px] font-semibold text-ink">
          Email PO intake
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.cards
            .filter((card) =>
              ["new-po-emails", "pos-awaiting-review", "email-action-required", "extraction-errors"].includes(card.id),
            )
            .map((card) => (
              <StatCard key={card.id} label={card.label} value={card.value} detail={card.detail} href={card.href} />
            ))}
        </div>
      </section>

      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="mb-2 text-[13px] font-semibold text-ink">
          Operations overview
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {summary.cards
            .filter(
              (card) =>
                ![
                  "pending-customer-pos",
                  "action-required-customer-pos",
                  "urgent-customer-pos",
                  "due-soon-customer-pos",
                  "new-po-emails",
                  "pos-awaiting-review",
                  "email-action-required",
                  "extraction-errors",
                  ...FULFILLMENT_CARD_IDS,
                ].includes(card.id),
            )
            .map((card) => (
              <StatCard key={card.id} label={card.label} value={card.value} detail={card.detail} href={card.href} />
            ))}
        </div>
      </section>

      <Panel title="Pending actions">
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
              cell: (row) => row.detail,
            },
            {
              id: "since",
              header: "Since",
              className: "whitespace-nowrap text-ink-secondary",
              cell: (row) => row.since,
            },
          ]}
          rows={summary.pendingActions}
          getRowKey={(row) => row.id}
          emptyTitle="No pending actions"
          emptyDescription="Items that need attention will be listed here."
        />
      </Panel>

      <Panel title="Recent activity">
        <DataTable<ActivityView>
          caption="Recent activity"
          columns={[
            { id: "time", header: "Time", className: "whitespace-nowrap text-ink-secondary", cell: (row) => row.time },
            { id: "user", header: "User", className: "whitespace-nowrap", cell: (row) => row.user },
            { id: "action", header: "Action", cell: (row) => row.action },
            { id: "record", header: "Record", className: "whitespace-nowrap", cell: (row) => row.record },
          ]}
          rows={summary.recentActivity}
          getRowKey={(row) => row.id}
          emptyTitle="No recent activity"
          emptyDescription="Record changes will appear here once audit history is connected."
        />
      </Panel>
    </div>
  );
}
