import type { ReactNode } from "react";
import { Button } from "./Button";

export function FilterBar({ children, onClear, clearLabel = "Limpiar filtros" }: { children: ReactNode; onClear?: () => void; clearLabel?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {onClear && <Button variant="ghost" size="sm" onClick={onClear}>{clearLabel}</Button>}
    </div>
  );
}
