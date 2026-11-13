import Link from "next/link";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { labelFulfilmentStatus } from "@/lib/fulfillment-labels";
import { formatQuantity, labelQaqcResult } from "@/lib/procurement-labels";
import { toneForStatusLabel } from "@/lib/status-tones";
import type { OperationalFulfilmentBoard, OperationalFulfilmentBucket, OperationalFulfilmentRow } from "@/types/fulfillment";

const BUCKET_META: Record<
  OperationalFulfilmentBucket,
  { title: string; description: string; actionHint: string; short: string }
> = {
  ready_for_fulfilment: {
    title: "Ready for fulfilment",
    description: "Purchase orders with reserved stock that still need a fulfilment created.",
    actionHint: "Create fulfilment",
    short: "Allocate / Fulfil",
  },
  awaiting_final_qaqc: {
    title: "Awaiting final QAQC",
    description: "Draft fulfilments waiting for a final quality check before dispatch.",
    actionHint: "Record QAQC",
    short: "QAQC",
  },
  blocked_qaqc: {
    title: "Blocked — QAQC",
    description: "Fulfilments held after a failed or on-hold final QAQC. Dispatch is blocked.",
    actionHint: "Review QAQC",
    short: "Blocked",
  },
  ready_to_dispatch: {
    title: "Ready to dispatch",
    description: "Fulfilments that passed final QAQC and have quantity remaining to dispatch.",
    actionHint: "Dispatch",
    short: "Dispatch",
  },
  completed: {
    title: "Completed",
    description: "Fulfilments fully or partially dispatched and closed out.",
    actionHint: "View",
    short: "Done",
  },
};

const BUCKET_ORDER: OperationalFulfilmentBucket[] = [
  "ready_for_fulfilment",
  "awaiting_final_qaqc",
  "blocked_qaqc",
  "ready_to_dispatch",
  "completed",
];

const thClass = "px-3 py-2 font-medium whitespace-nowrap";

function rowHref(row: OperationalFulfilmentRow): string {
  return row.fulfilmentId
    ? `/fulfilment/${row.fulfilmentId}`
    : `/customer-orders/${row.customerPoId}/fulfill`;
}

function statusLabel(row: OperationalFulfilmentRow): string {
  if (!row.fulfilmentId) return labelCustomerPoStatus(row.status);
  return labelFulfilmentStatus(row.status as Parameters<typeof labelFulfilmentStatus>[0]);
}

function OperationalTable({ rows }: { rows: OperationalFulfilmentRow[] }) {
  if (!rows.length) {
    return <p className="px-3 py-4 text-[12px] text-ink-muted">Nothing in this queue.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="sticky top-0 border-b border-border bg-surface-muted text-[11px] tracking-wide text-ink-muted uppercase">
          <tr>
            <th className={thClass}>FUL / PO</th>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Delivery</th>
            <th className={thClass}>Priority</th>
            <th className={thClass}>Batches</th>
            <th className={thClass}>Quantity</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>QAQC</th>
            <th className={thClass}>Next</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = statusLabel(row);
            return (
              <tr
                key={`${row.fulfilmentId || "po"}-${row.customerPoId}`}
                className="border-b border-border last:border-0 hover:bg-[#f8fafc]"
              >
                <td className="px-3 py-2">
                  <Link href={rowHref(row)} className="font-medium text-primary-text hover:underline">
                    {row.fulfilmentNumber || row.poNumber}
                  </Link>
                  <div className="text-[11px] text-ink-muted">
                    {row.fulfilmentNumber ? row.poNumber : "Allocations reserved"}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div>{row.customerName}</div>
                  <div className="text-[11px] text-ink-muted">{row.customerCode}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.requiredDeliveryDate ?? row.plannedDate ?? "—"}</td>
                <td className="px-3 py-2">
                  <PriorityBadge priority={row.priority} />
                </td>
                <td className="px-3 py-2 text-[12px] text-ink-muted">{row.batchNumbers.join(", ") || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {formatQuantity(row.dispatchedQuantity, row.unit)} / {formatQuantity(row.totalQuantity, row.unit)}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge tone={toneForStatusLabel(label)}>{label}</StatusBadge>
                </td>
                <td className="px-3 py-2">
                  {row.qaqcResult ? (
                    <StatusBadge tone={toneForStatusLabel(labelQaqcResult(row.qaqcResult))}>
                      {labelQaqcResult(row.qaqcResult)}
                    </StatusBadge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-[12px] text-ink-muted">
                  {
                    BUCKET_META[
                      row.fulfilmentId
                        ? row.canDispatch
                          ? "ready_to_dispatch"
                          : row.qaqcResult === "failed" || row.qaqcResult === "on_hold"
                            ? "blocked_qaqc"
                            : row.status === "draft"
                              ? "awaiting_final_qaqc"
                              : "completed"
                        : "ready_for_fulfilment"
                    ].actionHint
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OperationalFulfilmentBoardView({
  board,
  buckets = BUCKET_ORDER,
  activeBucket,
}: {
  board: OperationalFulfilmentBoard;
  buckets?: OperationalFulfilmentBucket[];
  activeBucket?: OperationalFulfilmentBucket | null;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Link
          href="/fulfilment"
          className={cn(
            "inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium",
            !activeBucket
              ? "border-primary/30 bg-primary-subtle text-primary-text"
              : "border-border bg-surface text-ink-secondary hover:bg-surface-muted",
          )}
        >
          All queues
        </Link>
        {BUCKET_ORDER.map((bucket) => {
          const count = board[bucket].length;
          const active = activeBucket === bucket;
          return (
            <Link
              key={bucket}
              href={`/fulfilment?bucket=${bucket}`}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium",
                active
                  ? "border-primary/30 bg-primary-subtle text-primary-text"
                  : "border-border bg-surface text-ink-secondary hover:bg-surface-muted",
              )}
            >
              {BUCKET_META[bucket].short}
              <span className="tabular-nums text-ink-muted">{count}</span>
            </Link>
          );
        })}
      </div>

      {buckets.map((bucket) => {
        const meta = BUCKET_META[bucket];
        const rows = board[bucket];
        return (
          <Panel
            key={bucket}
            title={`${meta.title}`}
            description={meta.description}
            actions={<span className="text-[12px] tabular-nums text-ink-muted">{rows.length}</span>}
          >
            <OperationalTable rows={rows} />
          </Panel>
        );
      })}
    </div>
  );
}
