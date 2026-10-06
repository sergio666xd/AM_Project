import type { Key, ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyTitle = "No hay información para mostrar",
  emptyDescription,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => Key;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-surface-muted text-xs uppercase tracking-wide text-foreground-muted">
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={`px-4 py-3 font-semibold ${column.className ?? ""}`}>{column.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border bg-surface">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="text-foreground-secondary">
              {columns.map((column) => <td key={column.key} className={`px-4 py-3 align-middle ${column.className ?? ""}`}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
