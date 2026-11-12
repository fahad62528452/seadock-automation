import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";

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
}: {
  caption: string;
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted text-[12px] font-medium text-ink-muted">
            {columns.map((column) => (
              <th key={column.id} scope="col" className={`px-4 py-2.5 font-medium ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface-muted">
                {columns.map((column) => (
                  <td key={column.id} className={`px-4 py-2.5 align-middle text-[13px] text-ink ${column.className ?? ""}`}>
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
