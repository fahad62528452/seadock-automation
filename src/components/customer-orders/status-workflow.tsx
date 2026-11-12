import { CUSTOMER_PO_WORKFLOW_STEPS, labelCustomerPoStatus } from "@/lib/customer-order-labels";
import { cn } from "@/lib/cn";
import type { CustomerPoStatus } from "@/types/customer-orders";

const STEP_INDEX: Record<string, number> = {
  received: 0,
  under_review: 1,
  action_required: 1,
  approved: 2,
  partially_allocated: 2,
  ready_for_fulfillment: 3,
  partially_fulfilled: 3,
  fulfilled: 4,
  cancelled: -1,
};

export function CustomerPoStatusWorkflow({ status }: { status: CustomerPoStatus | string }) {
  const current = STEP_INDEX[status] ?? 0;
  const cancelled = status === "cancelled";

  return (
    <ol className="space-y-2 p-4 text-[13px]">
      {CUSTOMER_PO_WORKFLOW_STEPS.map((step, index) => {
        const reached = !cancelled && current >= index;
        const active = !cancelled && current === index;
        return (
          <li key={step} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 inline-flex size-5 items-center justify-center rounded-full border text-[11px]",
                reached ? "border-primary bg-primary-subtle text-primary-text" : "border-border text-ink-muted",
                active && "font-semibold",
              )}
            >
              {index + 1}
            </span>
            <div>
              <p className={cn(active ? "font-semibold text-ink" : reached ? "text-ink" : "text-ink-muted")}>
                {labelCustomerPoStatus(step)}
              </p>
              {index < CUSTOMER_PO_WORKFLOW_STEPS.length - 1 ? (
                <p className="pl-1 text-ink-muted">↓</p>
              ) : null}
            </div>
          </li>
        );
      })}
      {cancelled ? <li className="font-medium text-warning">Cancelled</li> : null}
      {status === "action_required" ? (
        <li className="font-medium text-warning">Operator attention required before advancing.</li>
      ) : null}
    </ol>
  );
}
