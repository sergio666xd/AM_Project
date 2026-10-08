"use client";

import { useCallback, useEffect, useState } from "react";
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
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-(--foreground-muted) hover:bg-surface-hover" aria-label="Abrir búsqueda global">
      <Search className="size-4" /><span className="hidden sm:inline">Buscar</span><kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
    </button>
    {open && <div className="fixed inset-0 z-[100] bg-black/40 p-4 pt-[12vh]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section role="dialog" aria-modal="true" aria-label="Búsqueda global" className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-(--foreground-muted)" />
          <input autoFocus value={query} onChange={(event) => { const value = event.target.value; setQuery(value); if (value.trim().length < 2) { setResults([]); setLoading(false); } }} placeholder="Buscar clientes, procesos, radicados, tareas o documentos…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Buscar en la plataforma" />
          <button type="button" onClick={close} aria-label="Cerrar búsqueda" className="rounded p-2 hover:bg-surface-hover"><X className="size-4" /></button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2" aria-live="polite">
          {loading && <p className="p-4 text-sm text-(--foreground-muted)">Buscando…</p>}
          {!loading && query.trim().length < 2 && <p className="p-4 text-sm text-(--foreground-muted)">Escribe al menos dos caracteres.</p>}
          {!loading && query.trim().length >= 2 && results.length === 0 && <p className="p-4 text-sm text-(--foreground-muted)">No se encontraron resultados.</p>}
          {results.map((result) => <Link key={result.id} href={result.href} onClick={close} className="flex items-center justify-between gap-4 rounded-xl px-3 py-3 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none">
            <span className="min-w-0"><span className="block truncate text-sm font-medium">{result.titulo}</span><span className="block truncate text-xs text-(--foreground-muted)">{result.subtitulo}</span></span>
            <span className="shrink-0 rounded-full bg-surface-hover px-2 py-1 text-[10px]">{result.tipo}</span>
          </Link>)}
        </div>
      </section>
    </div>}
  </>;
}
