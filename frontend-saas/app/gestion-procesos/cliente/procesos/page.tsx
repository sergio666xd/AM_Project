"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FolderOpen, RefreshCw, Search } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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
      .then((data: Process[]) => {
        if (active) setItems(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar tus procesos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, sessionLoading]);

  const statuses = useMemo(
    () => Array.from(new Set(items.map((item) => item.estado_visible).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [items],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es-CO");
    return items.filter(
      (item) =>
        (status === "TODOS" || item.estado_visible === status) &&
        (!term ||
          [item.nombre, item.estado_visible, item.explicacion_estado, ...item.radicados.map((radicado) => radicado.numero)]
            .some((value) => value?.toLocaleLowerCase("es-CO").includes(term))),
    );
  }, [items, search, status]);

  return (
    <section className="mx-auto max-w-5xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Mis procesos"
        description="Consulta el estado, las novedades y las acciones de cada expediente."
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_15rem] shadow-xs">
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar proceso o radicado..."
              className="min-h-10 w-full rounded-lg border border-border bg-surface-secondary py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-brand-500 focus:outline-none"
            />
          </div>
          <select
            id="process-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filtrar por estado"
            className="min-h-10 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:outline-none"
          >
            <option value="TODOS">Todos los estados</option>
            {statuses.map((itemStatus) => (
              <option key={itemStatus} value={itemStatus}>
                {itemStatus}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading || sessionLoading ? (
        <div className="py-16 text-center text-sm text-muted">
          <RefreshCw className="mr-2 inline size-4 animate-spin text-brand-700" />
          Cargando procesos...
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((item) => (
            <Link
              href={`/gestion-procesos/cliente/procesos/${item.id}`}
              key={item.id}
              className="group flex flex-col justify-between rounded-xl border border-border bg-surface p-5 shadow-xs transition hover:border-brand-500/50 hover:bg-surface-hover/70"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    <FolderOpen className="size-5" />
                  </div>
                  <Badge tone="normal">
                    {item.radicados.length} radicado{item.radicados.length === 1 ? "" : "s"}
                  </Badge>
                </div>

                <h2 className="mt-3.5 text-base font-semibold text-foreground group-hover:text-brand-900 dark:group-hover:text-brand-200">
                  {item.nombre}
                </h2>
                <p className="mt-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                  {item.estado_visible}
                </p>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  {item.explicacion_estado}
                </p>
                <p className="mt-3 text-xs text-muted">
                  Responsable: <span className="font-medium text-foreground">{item.responsable?.nombre_completo || "Despacho"}</span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-3 text-xs text-muted">
                <span>{item.tareas_pendientes} tareas pendientes</span>
                <span>{item.documentos_pendientes} documentos por entregar</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface">
          <EmptyState
            icon={FolderOpen}
            title={items.length ? "Sin coincidencias" : "Aún no tienes procesos compartidos"}
            description={
              items.length
                ? "No hay procesos que coincidan con la búsqueda y el estado seleccionados."
                : "Cuando el despacho te vincule a un expediente judicial, aparecerá organizado en esta sección."
            }
          />
        </div>
      )}
    </section>
  );
}
