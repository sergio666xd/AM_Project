import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export function Pagination({ page, pageSize, total, onPageChange, label = "registros" }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  const effectivePageSize = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(total / effectivePageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = total === 0 ? 0 : (current - 1) * effectivePageSize + 1;
  const end = Math.min(current * effectivePageSize, total);
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-muted">
      <p>Mostrando {start}–{end} de {total} {label}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Página anterior" disabled={current <= 1} onClick={() => onPageChange(current - 1)}><ChevronLeft aria-hidden="true" className="size-4" /><span className="sr-only">Anterior</span></Button>
        <span aria-live="polite" className="min-w-20 text-center">Página {current} de {pages}</span>
        <Button variant="outline" size="sm" aria-label="Página siguiente" disabled={current >= pages} onClick={() => onPageChange(current + 1)}><ChevronRight aria-hidden="true" className="size-4" /><span className="sr-only">Siguiente</span></Button>
      </div>
    </nav>
  );
}
