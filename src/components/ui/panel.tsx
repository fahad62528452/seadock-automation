import type { ReactNode } from "react";

export function Panel({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface">
      {title ? (
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
