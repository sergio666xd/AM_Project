import type { ReactNode } from "react";
import { Button } from "./Button";
import { X } from "lucide-react";

export function FilterBar({
  children,
  onClear,
  clearLabel = "Limpiar filtros",
}: {
  children: ReactNode;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">{children}</div>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear} icon={<X className="size-3.5" />}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
