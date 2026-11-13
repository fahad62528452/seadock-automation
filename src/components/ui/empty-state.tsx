import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-4 text-ink-muted">{description}</p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
