"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw, Search } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";

type Process = {
  id: number;
  nombre: string;
  estado_visible: string;
  explicacion_estado: string;
  responsable?: { nombre_completo: string };
  tareas_pendientes: number;
  documentos_pendientes: number;
  ultima_actividad?: string | null;
  radicados: { id: number; numero: string }[];
};

export default function ProcesosClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("TODOS");

  useEffect(() => {
    if (!token || sessionLoading) return;
    let active = true;
    fetchApi("/api/expedientes/procesos", { token })
      .then((data: Process[]) => { if (active) setItems(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar tus procesos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, sessionLoading]);

  const statuses = useMemo(
    () => Array.from(new Set(items.map((item) => item.estado_visible).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CO");
    return items.filter((item) =>
      (status === "TODOS" || item.estado_visible === status)
      && (!term || [item.nombre, item.estado_visible, item.explicacion_estado, ...item.radicados.map((radicado) => radicado.numero)]
        .some((value) => value?.toLocaleLowerCase("es-CO").includes(term))),
    );
  }, [items, search, status]);

  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-24">
      <header>
        <p className="text-sm text-(--foreground-muted)">Portal del cliente</p>
        <h1 className="mt-1 text-2xl font-semibold">Mis procesos</h1>
        <p className="mt-1 text-sm text-(--foreground-muted)">Consulta el estado, las novedades y las acciones de cada expediente.</p>
      </header>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!loading && items.length > 0 && (
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative">
            <span className="sr-only">Buscar proceso o número de radicado</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--foreground-muted)" />
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar proceso o radicado" className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
          </label>
          <label className="sr-only" htmlFor="process-status">Filtrar por estado</label>
          <select id="process-status" value={status} onChange={(event) => setStatus(event.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="TODOS">Todos los estados</option>
            {statuses.map((itemStatus) => <option key={itemStatus} value={itemStatus}>{itemStatus}</option>)}
          </select>
        </div>
      )}
      {loading || sessionLoading ? (
        <p className="py-12 text-center text-sm text-(--foreground-muted)"><RefreshCw className="mr-2 inline size-4 animate-spin" />Cargando...</p>
      ) : filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <Link href={`/gestion-procesos/cliente/procesos/${item.id}`} key={item.id} className="rounded-xl border border-border bg-surface p-5 hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
              <FolderOpen aria-hidden="true" className="size-5 text-primary" />
              <h2 className="mt-3 font-semibold">{item.nombre}</h2>
              <p className="mt-1 text-sm font-medium text-primary">{item.estado_visible}</p>
              <p className="mt-1 text-sm text-(--foreground-muted)">{item.explicacion_estado}</p>
              <p className="mt-3 text-xs text-(--foreground-muted)">Responsable: {item.responsable?.nombre_completo || "Despacho"} · {item.radicados.length} radicados</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-(--foreground-muted)">
                <span>{item.tareas_pendientes} tareas pendientes</span>
                <span>{item.documentos_pendientes} documentos por entregar</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-(--foreground-muted)">
          {items.length ? "No hay procesos que coincidan con la búsqueda y el estado seleccionados." : "Aún no tienes procesos compartidos."}
        </div>
      )}
    </section>
  );
}
