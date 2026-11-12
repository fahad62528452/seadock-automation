import { cn } from "@/lib/cn";
import { priorityBadgeText } from "@/lib/customer-order-labels";
import type { CustomerPoPriority } from "@/types/customer-orders";

export function PriorityBadge({ priority }: { priority: CustomerPoPriority | string }) {
  const label = priorityBadgeText(priority);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide",
        priority === "urgent" && "border-warning/40 bg-[#fff7ed] text-warning",
        priority === "high" && "border-primary/30 bg-primary-subtle text-primary-text",
        priority === "normal" && "border-border bg-surface-muted text-ink-secondary",
      )}
      title={`Priority: ${label}`}
    >
      <span aria-hidden="true">{priority === "urgent" ? "!" : priority === "high" ? "▲" : "•"}</span>
      <span>{label}</span>
    </span>
  );
}
