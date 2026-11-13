import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyTitle,
  emptyDescription,
  emptyAction,
  compact = true,
}: {
  caption: string;
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
  compact?: boolean;
}) {
  const cellPad = compact ? "px-3 py-2" : "px-4 py-2.5";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-surface-muted text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            {columns.map((column) => (
              <th key={column.id} scope="col" className={cn(cellPad, "font-medium", column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-border last:border-b-0 hover:bg-[#f8fafc]"
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(cellPad, "align-middle text-[13px] text-ink", column.className)}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
