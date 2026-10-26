"use client";

import { useEffect, useId, useMemo, useState, type Key, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";
import { ApiErrorState } from "./ApiErrorState";
import { RowActionsMenu, type RowAction } from "./RowActionsMenu";

export type { RowAction } from "./RowActionsMenu";

type SortPrimitive = string | number | boolean | Date | null | undefined;

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  /** Oculta la columna en la tabla de escritorio por debajo de lg. */
  hideOnMobile?: boolean;
  /** Muestra la columna solo desde pantallas extra anchas (xl). */
  wideOnly?: boolean;
  /** Habilita el orden por esta columna. */
  sortValue?: (row: T) => SortPrimitive;
  /** Texto que participa en la búsqueda; por defecto, el valor de orden. */
  searchValue?: (row: T) => string | null | undefined;
  /** Valor exportado a CSV; por defecto, el de búsqueda u orden. */
  exportValue?: (row: T) => SortPrimitive;
  /** Papel de la columna en la tarjeta móvil. */
  mobile?: "title" | "subtitle" | "badge" | "meta" | "hidden";
  /** Etiqueta en la tarjeta móvil cuando `header` no es texto. */
  mobileLabel?: string;
  align?: "left" | "right" | "center";
}

export interface BulkAction<T> {
  label: string;
  icon?: ReactNode;
  tone?: "default" | "danger";
  onRun: (rows: T[]) => void | Promise<void>;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => Key;
  onRowClick?: (row: T) => void;
  /** Convierte el título de cada fila en un enlace. */
  rowHref?: (row: T) => string;
  rowActions?: RowAction<T>[];
  bulkActions?: BulkAction<T>[];
  /** Filtros y controles adicionales junto a la búsqueda. */
  toolbar?: ReactNode;
  /** Activa la búsqueda; se habilita sola si alguna columna es buscable. */
  searchPlaceholder?: string;
  searchable?: boolean;
  initialSort?: { key: string; direction: "asc" | "desc" };
  pageSize?: number;
  /** Exporta las filas filtradas a CSV con este nombre de archivo. */
  exportFilename?: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Descripción accesible de la tabla. */
  caption?: string;
  /** Clave para recordar orden y tamaño de página en este navegador. */
  storageKey?: string;
  /** Resalta filas, por ejemplo vencidas o en riesgo. */
  rowTone?: (row: T) => "danger" | "warning" | undefined;
  /** Número de filtros activos en `toolbar`, mostrado en el botón móvil. */
  activeFilterCount?: number;
  /** Muestra un botón para volver a cargar los datos. */
  onRefresh?: () => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

export function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es").trim();
}

function primitiveText(value: SortPrimitive): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

function compareValues(left: SortPrimitive, right: SortPrimitive) {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  // Los vacíos siempre al final, sin importar la dirección.
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return collator.compare(primitiveText(left), primitiveText(right));
}

function readStoredPreferences(storageKey?: string): { sort?: { key: string; direction: "asc" | "desc" }; pageSize?: number } {
  if (!storageKey) return {};
  try {
    return JSON.parse(localStorage.getItem(`table:${storageKey}`) || "{}");
  } catch {
    return {};
  }
}

function csvCell(value: string) {
  return /[",\n;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  rowHref,
  rowActions,
  bulkActions,
  toolbar,
  searchPlaceholder = "Buscar…",
  searchable,
  initialSort,
  pageSize: initialPageSize = 25,
  exportFilename,
  loading = false,
  error,
  onRetry,
  emptyTitle = "No hay información para mostrar",
  emptyDescription,
  emptyAction,
  caption,
  storageKey,
  rowTone,
  activeFilterCount = 0,
  onRefresh,
}: DataTableProps<T>) {
  const searchId = useId();
  const searchEnabled = searchable ?? columns.some((column) => column.searchValue || column.sortValue);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<Key>>(() => new Set());
  const [runningBulk, setRunningBulk] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Las preferencias guardadas se leen después de hidratar para no generar
  // diferencias entre el HTML del servidor y el del cliente.
  useEffect(() => {
    const stored = readStoredPreferences(storageKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con localStorage tras hidratar
    if (stored.sort && columns.some((column) => column.key === stored.sort?.key && column.sortValue)) setSort(stored.sort);
    if (stored.pageSize && PAGE_SIZE_OPTIONS.includes(stored.pageSize)) setPageSize(stored.pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`table:${storageKey}`, JSON.stringify({ sort, pageSize }));
    } catch {
      // Almacenamiento no disponible: la tabla funciona igual.
    }
  }, [pageSize, sort, storageKey]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(query);
    if (!term) return rows;
    const words = term.split(/\s+/);
    return rows.filter((row) => {
      const haystack = normalizeSearch(
        columns
          .map((column) => column.searchValue?.(row) ?? (column.sortValue ? primitiveText(column.sortValue(row)) : ""))
          .join(" "),
      );
      return words.every((word) => haystack.includes(word));
    });
  }, [columns, query, rows]);

  const sorted = useMemo(() => {
    const column = sort ? columns.find((item) => item.key === sort.key) : undefined;
    if (!sort || !column?.sortValue) return filtered;
    const getValue = column.sortValue;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      const leftEmpty = leftValue === null || leftValue === undefined || leftValue === "";
      const rightEmpty = rightValue === null || rightValue === undefined || rightValue === "";
      if (leftEmpty || rightEmpty) return compareValues(leftValue, rightValue);
      return compareValues(leftValue, rightValue) * factor;
    });
  }, [columns, filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(rowKey(row))), [rowKey, rows, selected]);
  const selectable = Boolean(bulkActions?.length);
  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(rowKey(row)));
  const allFilteredSelected = sorted.length > 0 && sorted.every((row) => selected.has(rowKey(row)));
  const titleColumn = columns.find((column) => column.mobile === "title") ?? columns[0];

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    setPage(1);
    setSort((current) => {
      if (current?.key !== column.key) return { key: column.key, direction: "asc" };
      if (current.direction === "asc") return { key: column.key, direction: "desc" };
      return initialSort ?? null;
    });
  }

  function toggleRow(key: Key) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current);
      pageRows.forEach((row) => (allPageSelected ? next.delete(rowKey(row)) : next.add(rowKey(row))));
      return next;
    });
  }

  async function runBulk(action: BulkAction<T>) {
    setRunningBulk(true);
    try {
      await action.onRun(selectedRows);
      setSelected(new Set());
    } finally {
      setRunningBulk(false);
    }
  }

  function exportCsv() {
    const exportable = columns.filter((column) => column.exportValue || column.searchValue || column.sortValue);
    const header = exportable.map((column) => csvCell(column.mobileLabel ?? (typeof column.header === "string" ? column.header : column.key)));
    const lines = sorted.map((row) =>
      exportable
        .map((column) => {
          const value = column.exportValue?.(row) ?? column.searchValue?.(row) ?? column.sortValue?.(row);
          return csvCell(primitiveText(value ?? ""));
        })
        .join(";"),
    );
    const blob = new Blob([`﻿${[header.join(";"), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${exportFilename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const columnLabel = (column: DataTableColumn<T>) =>
    column.mobileLabel ?? (typeof column.header === "string" ? column.header : column.key);

  const renderTitle = (row: T) => {
    const content = titleColumn.render(row);
    if (!rowHref) return content;
    return (
      <Link
        href={rowHref(row)}
        onClick={(event) => event.stopPropagation()}
        className="font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
      >
        {content}
      </Link>
    );
  };

  const toneClass = (row: T) => {
    const tone = rowTone?.(row);
    return tone === "danger" ? "border-l-2 border-l-danger" : tone === "warning" ? "border-l-2 border-l-warning" : "";
  };

  const hasRows = rows.length > 0;

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-xs)]" aria-label={caption}>
      {(searchEnabled || toolbar || onRefresh) && (
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex min-w-0 gap-2 sm:contents">
          {searchEnabled && (
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none lg:w-80">
              <label htmlFor={searchId} className="sr-only">{searchPlaceholder}</label>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted" />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-10 w-full rounded-[var(--radius-md)] border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-foreground-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded text-foreground-muted hover:bg-surface-hover"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Actualizar datos"
              title="Actualizar"
              className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover disabled:opacity-50 sm:order-last"
            >
              <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {toolbar && (
            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium sm:hidden ${activeFilterCount ? "border-primary bg-primary-light text-primary" : "border-border text-foreground"}`}
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              Filtros{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          )}
          </div>
          {toolbar && (
            <div className={`${filtersOpen ? "grid" : "hidden"} min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center [&_details]:w-full sm:[&_details]:w-auto [&_select]:h-10 [&_select]:w-full sm:[&_select]:w-auto`}>
              {toolbar}
            </div>
          )}
          {exportFilename && hasRows && (searchEnabled || toolbar || onRefresh) && (
            <button
              type="button"
              onClick={exportCsv}
              className="hidden h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-sm font-medium text-foreground hover:bg-surface-hover sm:ml-auto sm:inline-flex"
            >
              <Download aria-hidden="true" className="size-4" />
              Exportar CSV
            </button>
          )}
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-light px-3 py-2 text-sm" role="region" aria-label="Acciones en lote">
          <span className="font-semibold text-foreground">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</span>
          {!allFilteredSelected && sorted.length > pageRows.length && (
            <button type="button" onClick={() => setSelected(new Set(sorted.map(rowKey)))} className="text-primary underline-offset-2 hover:underline">
              Seleccionar los {sorted.length}
            </button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="text-foreground-muted underline-offset-2 hover:underline">
            Quitar selección
          </button>
          <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
            {bulkActions?.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={runningBulk}
                onClick={() => void runBulk(action)}
                className={`inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium disabled:opacity-50 sm:flex-none ${
                  action.tone === "danger" ? "border-danger/30 bg-surface text-danger hover:bg-danger-light" : "border-border bg-surface text-foreground hover:bg-surface-hover"
                }`}
              >
                {action.icon && <span aria-hidden="true" className="[&>svg]:size-4">{action.icon}</span>}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && !hasRows ? (
        <div className="p-4"><LoadingState label="Cargando registros" rows={5} /></div>
      ) : error && !hasRows ? (
        <div className="p-4"><ApiErrorState error={error} onRetry={onRetry} /></div>
      ) : sorted.length === 0 ? (
        query ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={`No hay registros que coincidan con “${query}”.`}
            action={<button type="button" onClick={() => setQuery("")} className="text-sm font-medium text-primary hover:underline">Limpiar búsqueda</button>}
          />
        ) : (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        )
      ) : (
        <>
          {/* Escritorio y tableta: tabla con cabecera fija y orden por columna. */}
          <div className="hidden max-h-[70vh] overflow-auto md:block">
            <table className="w-full border-collapse text-left text-sm">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead className="sticky top-0 z-10 bg-surface-muted">
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                  {selectable && (
                    <th scope="col" className="w-10 px-3 py-3">
                      <input type="checkbox" aria-label="Seleccionar página" checked={allPageSelected} onChange={togglePage} className="size-4 accent-[var(--primary)]" />
                    </th>
                  )}
                  {columns.map((column) => {
                    const active = sort?.key === column.key;
                    const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : column.sortValue ? "none" : undefined;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={ariaSort}
                        className={`whitespace-nowrap px-4 py-3 ${column.wideOnly ? "hidden xl:table-cell" : column.hideOnMobile ? "hidden lg:table-cell" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""} ${column.className ?? ""}`}
                      >
                        {column.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column)}
                            className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ${active ? "text-foreground" : ""}`}
                          >
                            {column.header}
                            {active ? (
                              sort.direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3.5" /> : <ArrowDown aria-hidden="true" className="size-3.5" />
                            ) : (
                              <ArrowUpDown aria-hidden="true" className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions && <th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Acciones</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((row) => {
                  const key = rowKey(row);
                  const isSelected = selected.has(key);
                  return (
                    <tr
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={`text-foreground-secondary transition-colors hover:bg-surface-hover ${onRowClick ? "cursor-pointer" : ""} ${isSelected ? "bg-primary-light" : ""} ${toneClass(row)}`}
                    >
                      {selectable && (
                        <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" aria-label="Seleccionar fila" checked={isSelected} onChange={() => toggleRow(key)} className="size-4 accent-[var(--primary)]" />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={`px-4 py-3 align-middle ${column.wideOnly ? "hidden xl:table-cell" : column.hideOnMobile ? "hidden lg:table-cell" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""} ${column.className ?? ""}`}
                        >
                          {column === titleColumn ? renderTitle(row) : column.render(row)}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="px-2 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                          <RowActionsMenu row={row} actions={rowActions} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas legibles con las acciones al alcance del pulgar. */}
          <ul className="divide-y divide-border md:hidden">
            {pageRows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.has(key);
              const subtitle = columns.filter((column) => column.mobile === "subtitle");
              const badges = columns.filter((column) => column.mobile === "badge");
              const meta = columns.filter((column) => column.mobile === "meta" || (column.mobile === undefined && column !== titleColumn && !column.hideOnMobile));
              return (
                <li
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`flex gap-3 px-3 py-3.5 ${onRowClick ? "cursor-pointer active:bg-surface-hover" : ""} ${isSelected ? "bg-primary-light" : ""} ${toneClass(row)}`}
                >
                  {selectable && (
                    <div className="pt-0.5" onClick={(event) => event.stopPropagation()}>
                      <input type="checkbox" aria-label="Seleccionar" checked={isSelected} onChange={() => toggleRow(key)} className="size-5 accent-[var(--primary)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold leading-snug text-foreground">{renderTitle(row)}</div>
                    {subtitle.map((column) => (
                      <div key={column.key} className="mt-0.5 text-sm text-foreground-muted">{column.render(row)}</div>
                    ))}
                    {badges.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {badges.map((column) => <span key={column.key}>{column.render(row)}</span>)}
                      </div>
                    )}
                    {meta.length > 0 && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {meta.map((column) => (
                          <div key={column.key} className="min-w-0">
                            <dt className="text-foreground-muted">{columnLabel(column)}</dt>
                            <dd className="break-words text-sm text-foreground-secondary">{column.render(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  {rowActions && (
                    <div className="-mr-1 shrink-0" onClick={(event) => event.stopPropagation()}>
                      <RowActionsMenu row={row} actions={rowActions} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <footer className="flex flex-col gap-3 border-t border-border px-3 py-2.5 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
              {sorted.length === rows.length
                ? `${rows.length} registro${rows.length === 1 ? "" : "s"}`
                : `${sorted.length} de ${rows.length} registros`}
              </span>
              {exportFilename && !(searchEnabled || toolbar || onRefresh) && (
                <button type="button" onClick={exportCsv} className="hidden items-center gap-1.5 font-medium text-primary hover:underline sm:inline-flex">
                  <Download aria-hidden="true" className="size-3.5" />
                  Exportar CSV
                </button>
              )}
            </p>
            {sorted.length > PAGE_SIZE_OPTIONS[0] && (
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <label className="flex items-center gap-2">
                <span className="hidden sm:inline">Por página</span>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  aria-label="Registros por página"
                  className="h-9 rounded-[var(--radius-md)] border border-border bg-background px-2 text-sm text-foreground"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <nav aria-label="Paginación" className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  aria-label="Página anterior"
                  className="grid size-9 place-items-center rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <span aria-live="polite" className="min-w-16 text-center text-foreground">{currentPage} / {pageCount}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage >= pageCount}
                  aria-label="Página siguiente"
                  className="grid size-9 place-items-center rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </nav>
            </div>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
