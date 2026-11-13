import type { ReactNode } from "react";

/** Compact ERP list toolbar: filters (form children) + count + primary CTA. */
export function ListToolbar({
  children,
  resultCount,
  resultLabel = "records",
  actions,
}: {
  children?: ReactNode;
  resultCount?: number;
  resultLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-3 py-2.5 sm:px-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">{children}</div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {typeof resultCount === "number" ? (
            <span className="text-[12px] text-ink-muted tabular-nums">
              {resultCount} {resultLabel}
            </span>
          ) : null}
          {actions}
        </div>
      </div>
    </div>
  );
}
