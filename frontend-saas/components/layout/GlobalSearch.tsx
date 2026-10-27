"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type SearchResult = { id: string; tipo: string; titulo: string; subtitulo: string; href: string };

export default function GlobalSearch() {
  const { user, token } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const enabled = user?.rol === "ADMIN" || user?.rol === "ABOGADO_ADMIN";
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(""); setResults([]); setLoading(false); }, []);
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setOpen(true);
      } else if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, close]);

  // El buscador se despliega en el mismo encabezado: se cierra al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (!open || !token || query.trim().length < 2) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await fetchApi(`/api/expedientes/busqueda-global?q=${encodeURIComponent(query)}`, { token });
        if (active) setResults(data as SearchResult[]);
      } catch { if (active) setResults([]); }
      finally { if (active) setLoading(false); }
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query, token]);

  if (!enabled) return null;
  const hasQuery = query.trim().length >= 2;
  return (
    <div ref={rootRef} className="relative flex justify-end">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 text-sm text-(--foreground-muted) hover:bg-surface-hover" aria-label="Abrir búsqueda global">
          <Search className="size-4" /><span className="hidden sm:inline">Buscar</span><kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
        </button>
      ) : (
        // En móvil ocupa el ancho del encabezado; en escritorio crece hacia la izquierda.
        <div role="search" className="fixed inset-x-3 top-[calc((var(--header-height)-2.75rem)/2)] z-50 md:static md:w-[min(36rem,calc(100vw-30rem))]">
          <div className="flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-primary/40 bg-surface px-3 shadow-sm ring-2 ring-primary/10 md:h-10">
            <Search className="size-4 shrink-0 text-(--foreground-muted)" aria-hidden="true" />
            <input autoFocus value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setLoading(false); } }} placeholder="Buscar clientes, procesos, radicados, tareas o documentos…" className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Buscar en la plataforma" aria-controls="global-search-results" />
            <button type="button" onClick={close} aria-label="Cerrar búsqueda" className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-surface-hover"><X className="size-4" /></button>
          </div>
          {hasQuery && (
            <div id="global-search-results" className="absolute inset-x-0 top-full mt-2 max-h-[60vh] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-1.5 shadow-lg" aria-live="polite">
              {loading && <p className="p-3 text-sm text-(--foreground-muted)">Buscando…</p>}
              {!loading && results.length === 0 && <p className="p-3 text-sm text-(--foreground-muted)">No se encontraron resultados.</p>}
              {results.map((result) => <Link key={result.id} href={result.href} onClick={close} className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{result.titulo}</span><span className="block truncate text-xs text-(--foreground-muted)">{result.subtitulo}</span></span>
                <span className="shrink-0 rounded-full bg-surface-hover px-2 py-1 text-[10px]">{result.tipo}</span>
              </Link>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
