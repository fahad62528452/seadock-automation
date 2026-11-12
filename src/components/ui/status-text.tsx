import { cn } from "@/lib/cn";
import type { StatusTone } from "@/types/dashboard";

const toneClass: Record<StatusTone, string> = {
  warning: "bg-warning",
  info: "bg-primary",
  neutral: "bg-ink-muted",
};

export function StatusText({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className={cn("size-1.5 rounded-full", toneClass[tone])} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
