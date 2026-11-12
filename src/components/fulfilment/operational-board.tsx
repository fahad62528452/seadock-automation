import Link from "next/link";
import { PriorityBadge } from "@/components/customer-orders/priority-badge";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/form";
import { labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { labelFulfilmentStatus } from "@/lib/fulfillment-labels";
import { formatQuantity, labelQaqcResult } from "@/lib/procurement-labels";
import type { OperationalFulfilmentBoard, OperationalFulfilmentBucket, OperationalFulfilmentRow } from "@/types/fulfillment";

const BUCKET_META: Record<
  OperationalFulfilmentBucket,
  { title: string; description: string; actionHint: string }
> = {
  ready_for_fulfilment: {
    title: "Ready for fulfilment",
    description: "Purchase orders with reserved stock that still need a fulfilment created.",
    actionHint: "Create fulfilment",
  },
  awaiting_final_qaqc: {
    title: "Awaiting final QAQC",
    description: "Draft fulfilments waiting for a final quality check before dispatch.",
    actionHint: "Record QAQC",
  },
  blocked_qaqc: {
    title: "Blocked — QAQC",
    description: "Fulfilments held after a failed or on-hold final QAQC. Dispatch is blocked.",
    actionHint: "Review QAQC",
  },
  ready_to_dispatch: {
    title: "Ready to dispatch",
    description: "Fulfilments that passed final QAQC and have quantity remaining to dispatch.",
    actionHint: "Dispatch",
  },
  completed: {
    title: "Completed",
    description: "Fulfilments fully or partially dispatched and closed out.",
    actionHint: "View",
  },
};

const BUCKET_ORDER: OperationalFulfilmentBucket[] = [
  "ready_for_fulfilment",
  "awaiting_final_qaqc",
  "blocked_qaqc",
  "ready_to_dispatch",
  "completed",
];

const thClass = "px-4 py-2 font-medium whitespace-nowrap";

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
    return <p className="p-4 text-[13px] text-ink-muted">Nothing in this bucket.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="border-b border-border bg-surface-muted text-[12px] text-ink-muted">
          <tr>
            <th className={thClass}>FUL / PO</th>
            <th className={thClass}>Customer</th>
            <th className={thClass}>Delivery</th>
            <th className={thClass}>Priority</th>
            <th className={thClass}>Batches</th>
            <th className={thClass}>Quantity</th>
            <th className={thClass}>Status</th>
            <th className={thClass}>QAQC</th>
            <th className={thClass}>Next step</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.fulfilmentId || "po"}-${row.customerPoId}`} className="border-b border-border last:border-0">
              <td className="px-4 py-2">
                <Link href={rowHref(row)} className="font-medium text-primary-text hover:underline">
                  {row.fulfilmentNumber || row.poNumber}
                </Link>
                <div className="text-[12px] text-ink-muted">
                  {row.fulfilmentNumber ? row.poNumber : "Allocations reserved"}
                </div>
              </td>
              <td className="px-4 py-2">
                <div>{row.customerName}</div>
                <div className="text-[12px] text-ink-muted">{row.customerCode}</div>
              </td>
              <td className="px-4 py-2 whitespace-nowrap">{row.requiredDeliveryDate ?? row.plannedDate ?? "—"}</td>
              <td className="px-4 py-2">
                <PriorityBadge priority={row.priority} />
              </td>
              <td className="px-4 py-2 text-[12px] text-ink-muted">{row.batchNumbers.join(", ") || "—"}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                {formatQuantity(row.dispatchedQuantity, row.unit)} / {formatQuantity(row.totalQuantity, row.unit)}
                {row.remainingQuantity > 0 && row.dispatchedQuantity > 0 ? (
                  <div className="text-[12px] text-ink-muted">
                    {formatQuantity(row.remainingQuantity, row.unit)} remaining
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-2">
                <StatusBadge>{statusLabel(row)}</StatusBadge>
              </td>
              <td className="px-4 py-2">{row.qaqcResult ? labelQaqcResult(row.qaqcResult) : "—"}</td>
              <td className="px-4 py-2 text-[12px] text-ink-muted">
                {BUCKET_META[
                  row.fulfilmentId
                    ? row.canDispatch
                      ? "ready_to_dispatch"
                      : row.qaqcResult === "failed" || row.qaqcResult === "on_hold"
                        ? "blocked_qaqc"
                        : row.status === "draft"
                          ? "awaiting_final_qaqc"
                          : "completed"
                    : "ready_for_fulfilment"
                ].actionHint}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationalFulfilmentBoardView({
  board,
  buckets = BUCKET_ORDER,
}: {
  board: OperationalFulfilmentBoard;
  buckets?: OperationalFulfilmentBucket[];
}) {
  return (
    <div className="space-y-4">
      {buckets.map((bucket) => {
        const meta = BUCKET_META[bucket];
        const rows = board[bucket];
        return (
          <Panel key={bucket} title={`${meta.title} (${rows.length})`} description={meta.description}>
            <OperationalTable rows={rows} />
          </Panel>
        );
      })}
    </div>
  );
}
