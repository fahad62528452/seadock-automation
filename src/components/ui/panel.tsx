import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-surface", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-[11px] text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
