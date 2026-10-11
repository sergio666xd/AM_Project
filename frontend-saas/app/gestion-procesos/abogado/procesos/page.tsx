"use client";

import { apiRequest } from "@/lib/api";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { OperationResult } from "@/components/ui/OperationResult";
import {
  ArrowRight,
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  FilePlus2,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";


type Process = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  responsable?: { id: number; nombre_completo: string };
  colaboradores?: { id: number; nombre_completo: string }[];
  soy_responsable?: boolean;
  archivado_en?: string | null;
  radicados_count?: number;
  clientes_count?: number;
  clientes?: { id: number; nombre_completo: string }[];
  tareas_pendientes?: number;
  tareas_vencidas?: number;
  documentos_pendientes?: number;
  proxima_actividad?: string | null;
  ultima_actividad?: string | null;
  estado_atencion?: "ACTIVO" | "ATENCION";
  riesgo?: boolean;
  inactivo?: boolean;
  radicados: {
    id: number;
    numero: string;
    actuaciones: {
      id: number;
    }[];
  }[];
};

async function requestProcesses(showArchived: boolean, headers: Record<string, string>) {
  const route = showArchived ? "procesos/archivados" : "procesos";
  const response = await apiRequest(`/api/expedientes/${route}`, { headers });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "No fue posible cargar los procesos.");
  return data as Process[];
}

export default function ProcesosPage() {
  const [items, setItems] = useState<Process[]>([]);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [scopeFilter, setScopeFilter] = useState("TODAS");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeHref, setNoticeHref] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setItems(await requestProcesses(showArchived, headers()));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al cargar los procesos."
      );
    } finally {
      setLoading(false);
    }
  }, [headers, showArchived]);

  useEffect(() => {
    let active = true;
    requestProcesses(showArchived, headers())
      .then((data) => { if (active) setItems(data); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Error al cargar los procesos.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [headers, showArchived]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const searchText = `${item.nombre} ${item.descripcion || ""} ${item.responsable?.nombre_completo || ""} ${(item.clientes || []).map((client) => client.nombre_completo).join(" ")} ${item.radicados.map((radicado) => radicado.numero).join(" ")}`.toLowerCase();
      const matchesSearch = !normalizedQuery || searchText.includes(normalizedQuery);
      const matchesScope = scopeFilter === "TODAS" || scopeFilter === "PROPIOS" && item.soy_responsable || scopeFilter === "COLABORATIVOS" && !item.soy_responsable || scopeFilter === "ATENCION" && item.estado_atencion === "ATENCION" || scopeFilter === "RIESGO" && item.riesgo;
      return matchesSearch && matchesScope;
    });
  }, [items, query, scopeFilter]);

  const totalRadicados = useMemo(
    () =>
      items.reduce((total, item) => total + item.radicados.length, 0),
    [items]
  );

  const totalActuaciones = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total +
          item.radicados.reduce(
            (radicadosTotal, radicado) =>
              radicadosTotal + radicado.actuaciones.length,
            0
          ),
        0
      ),
    [items]
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) return;

    setWorking(true);
    setError("");

    try {
      const response = await apiRequest(
        `/api/expedientes/procesos`,
        {
          method: "POST",
          headers: {
            ...headers(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre: name.trim(),
            descripcion: description.trim() || null,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.detail || "No fue posible crear el proceso."
        );
      }

      setName("");
      setDescription("");
      setShowCreateModal(false);

      await load();

      setNotice("Proceso creado correctamente.");
      setNoticeHref(typeof body.id === "number" ? `/gestion-procesos/abogado/procesos/${body.id}` : null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Error al crear el proceso."
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeArchiveStatus(processId: number, archive: boolean) {
    setWorking(true);
    setError("");
    try {
      const response = await apiRequest(`/api/expedientes/procesos/${processId}${archive ? "" : "/restaurar"}`, {
        method: archive ? "DELETE" : "PATCH",
        headers: headers(),
      });
      const body: { mensaje?: string; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.detail || "No fue posible actualizar el proceso.");
      await load();
      setNotice(body.mensaje || (archive ? "Proceso archivado." : "Proceso restaurado."));
      setNoticeHref(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar el proceso.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
          <Loader2 className="size-5 animate-spin" />
          Cargando procesos...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* TOAST */}
      {notice && <OperationResult title={notice} description={noticeHref ? "El expediente quedó creado y puedes continuar con sus datos." : undefined} actionHref={noticeHref ?? undefined} actionLabel={noticeHref ? "Abrir expediente" : undefined} onDismiss={() => { setNotice(""); setNoticeHref(null); }} />}

      {/* HEADER */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Despacho
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
            {showArchived ? "Archivados" : "Procesos"}
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Administra los procesos del despacho y accede a la ficha de cada
            uno para consultar su información.
          </p>
        </div>

        {/* RESUMEN */}
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Procesos
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {items.length}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Radicados
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {totalRadicados}
            </p>
          </div>

          <div className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:block">
            <p className="text-xs text-[var(--foreground-muted)]">
              Actuaciones
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
              {totalActuaciones}
            </p>
          </div>
        </div>
      </header>

      {/* ERROR */}
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => {
              setError("");
              void load();
            }}
            className="shrink-0 rounded-lg border border-red-500/20 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* CINTA DE OPCIONES */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {!showArchived && <button
              type="button"
              onClick={() => {
                setError("");
                setShowCreateModal(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white shadow-sm transition hover:opacity-90"
            >
              <Plus className="size-4" />
              Nuevo proceso
            </button>}

            <div role="group" aria-label="Estado de los procesos" className="inline-flex rounded-lg border border-[var(--border)] p-1">
              <button type="button" aria-pressed={!showArchived} onClick={() => { if (showArchived) { setLoading(true); setQuery(""); setShowArchived(false); } }} className={`rounded-md px-3 py-1.5 text-sm ${!showArchived ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}>Activos</button>
              <button type="button" aria-pressed={showArchived} onClick={() => { if (!showArchived) { setLoading(true); setQuery(""); setShowArchived(true); } }} className={`rounded-md px-3 py-1.5 text-sm ${showArchived ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}>Archivados</button>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
            >
              Actualizar
            </button>
          </div>

          {!showArchived && <select aria-label="Filtrar procesos" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)} className="h-10 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 text-sm text-[var(--foreground)]"><option value="TODAS">Todos los procesos</option><option value="PROPIOS">Propios</option><option value="COLABORATIVOS">Colaborativos</option><option value="ATENCION">Requieren atención</option><option value="RIESGO">En riesgo</option></select>}
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar proceso..."
              aria-label="Buscar procesos"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] py-2.5 pl-9 pr-9 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
            />

            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* RESULTADO */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              {showArchived ? "Procesos archivados" : "Procesos del despacho"}
            </h2>

            <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
              {filtered.length === items.length
                ? `${items.length} proceso${items.length === 1 ? "" : "s"}`
                : `${filtered.length} de ${items.length} procesos`}
            </p>
          </div>
          <div role="group" aria-label="Vista de procesos" className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            <button type="button" aria-label="Vista de fichas" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${viewMode === "cards" ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}><LayoutGrid className="size-3.5" /><span className="hidden sm:inline">Fichas</span></button>
            <button type="button" aria-label="Vista de lista" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${viewMode === "list" ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}><List className="size-3.5" /><span className="hidden sm:inline">Lista</span></button>
          </div>
        </div>

        {filtered.length > 0 ? (
          viewMode === "cards" ? (
          <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const actuaciones = item.radicados.reduce(
                (total, radicado) =>
                  total + radicado.actuaciones.length,
                0
              );

              return (
                <article
                  key={item.id}
                  className="group flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-5 transition hover:border-[var(--primary)]/40 hover:shadow-sm"
                >
                  {/* ICONO + NOMBRE */}
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                      <BriefcaseBusiness className="size-5" />
                    </div>

                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-[var(--foreground)]">
                        {item.nombre}
                      </h3>

                      <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                        Proceso #{item.id}
                      </p>
                    </div>
                  </div>

                  {/* DESCRIPCIÓN */}
                  <p className="mt-4 min-h-[42px] text-sm leading-5 text-[var(--foreground-muted)]">
                    {item.descripcion || "Sin descripción"}
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-[var(--foreground-muted)]">
                    {item.responsable && (
                      <p>Responsable: <span className="font-medium text-[var(--foreground)]">{item.responsable.nombre_completo}</span></p>
                    )}
                    {item.colaboradores?.length ? (
                      <p>Equipo: {item.colaboradores.map((member) => member.nombre_completo).join(", ")}</p>
                    ) : null}
                    {!item.soy_responsable && <p>Acceso de colaborador</p>}
                  </div>

                  {/* MÉTRICAS */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Radicados
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                        {item.radicados.length}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Actuaciones
                      </p>
                      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">
                        {actuaciones}
                      </p>
                    </div>
                  </div>
                  {!showArchived && <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5"><p className="text-[var(--foreground-muted)]">Tareas pendientes</p><p className="mt-1 font-semibold">{item.tareas_pendientes ?? 0}{(item.tareas_vencidas ?? 0) > 0 && <span className="ml-1 text-red-600">· {item.tareas_vencidas} vencidas</span>}</p></div><div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5"><p className="text-[var(--foreground-muted)]">Documentos pendientes</p><p className="mt-1 font-semibold">{item.documentos_pendientes ?? 0}</p></div></div>}
                  {!showArchived && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--foreground-muted)]"><span>Última actividad: {item.ultima_actividad ? new Date(item.ultima_actividad).toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "Sin actividad"}</span>{item.proxima_actividad && <span>Próxima: {new Date(item.proxima_actividad).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</span>}<span className={`rounded-full px-2 py-1 ${item.estado_atencion === "ATENCION" ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>{item.estado_atencion === "ATENCION" ? "Requiere atención" : "Al día"}</span></div>}

                  {/* RADICADOS */}
                  {item.radicados.length > 0 && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                        Radicados
                      </p>

                      <div className="space-y-1.5">
                        {item.radicados.slice(0, 3).map((radicado) => (
                          <div
                            key={radicado.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                          >
                            <span className="truncate font-mono text-xs text-[var(--foreground)]">
                              {radicado.numero}
                            </span>

                            <span className="ml-2 shrink-0 text-[10px] text-[var(--foreground-muted)]">
                              {radicado.actuaciones.length} act.
                            </span>
                          </div>
                        ))}

                        {item.radicados.length > 3 && (
                          <p className="px-1 pt-1 text-xs text-[var(--foreground-muted)]">
                            +{item.radicados.length - 3} radicado
                            {item.radicados.length - 3 === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ACCIÓN */}
                  {showArchived ? (
                    <button type="button" disabled={working} onClick={() => void changeArchiveStatus(item.id, false)} className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5 disabled:opacity-50">
                      <ArchiveRestore className="size-4" /> Restaurar proceso
                    </button>
                  ) : (
                    <div className="mt-5 flex gap-2">
                      <Link
                        href={`/gestion-procesos/abogado/procesos/${item.id}`}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5"
                      >
                        Abrir ficha
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      <button type="button" disabled={working} onClick={() => void changeArchiveStatus(item.id, true)} aria-label={`Archivar ${item.nombre}`} title="Archivar proceso" className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:border-amber-600/40 hover:text-amber-700 disabled:opacity-50">
                        <Archive className="size-4" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {filtered.map((item) => {
                const actuaciones = item.radicados.reduce((total, radicado) => total + radicado.actuaciones.length, 0);
                return (
                  <div key={item.id} className="flex flex-col gap-4 px-4 py-4 transition hover:bg-[var(--surface-secondary)]/40 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                    <Link href={`/gestion-procesos/abogado/procesos/${item.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]"><BriefcaseBusiness className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-[var(--foreground)]">{item.nombre}</strong><span className="text-[11px] text-[var(--foreground-muted)]">#{item.id}</span>{!item.soy_responsable && <span className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--foreground-muted)]">Colaborador</span>}{!showArchived && <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.estado_atencion === "ATENCION" ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>{item.estado_atencion === "ATENCION" ? "Requiere atención" : "Al día"}</span>}</span>
                        <span className="mt-1 block truncate text-xs text-[var(--foreground-muted)]">{item.descripcion || "Sin descripción"}</span>
                        <span className="mt-1 block truncate text-xs text-[var(--foreground-muted)]">{item.responsable ? `Responsable: ${item.responsable.nombre_completo}` : ""}{item.clientes?.length ? ` · ${item.clientes.length} cliente${item.clientes.length === 1 ? "" : "s"}` : ""}{item.radicados.length ? ` · ${item.radicados.length} radicado${item.radicados.length === 1 ? "" : "s"}` : ""}</span>
                      </span>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 pl-[52px] lg:pl-0">
                      <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground-muted)]">{actuaciones} actuación{actuaciones === 1 ? "" : "es"}</span>
                      {!showArchived && <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground-muted)]">{item.tareas_pendientes ?? 0} tarea{(item.tareas_pendientes ?? 0) === 1 ? "" : "s"} pendiente{(item.tareas_pendientes ?? 0) === 1 ? "" : "s"}</span>}
                      {showArchived ? <button type="button" disabled={working} onClick={() => void changeArchiveStatus(item.id, false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"><ArchiveRestore className="size-3.5" />Restaurar</button> : <><Link href={`/gestion-procesos/abogado/procesos/${item.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium !text-white hover:opacity-90">Abrir ficha<ArrowRight className="size-3.5" /></Link><button type="button" disabled={working} onClick={() => void changeArchiveStatus(item.id, true)} aria-label={`Archivar ${item.nombre}`} className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:border-amber-600/40 hover:text-amber-700 disabled:opacity-50"><Archive className="size-4" /></button></>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
              <FilePlus2 className="size-6 text-[var(--foreground-muted)]" />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-[var(--foreground)]">
              {showArchived ? "No hay procesos archivados" : query
                ? "No encontramos procesos"
                : "Todavía no hay procesos"}
            </h3>

            <p className="mt-1 max-w-sm text-sm text-[var(--foreground-muted)]">
              {showArchived ? "Los procesos archivados aparecerán aquí." : query
                ? "Prueba con otro término de búsqueda."
                : "Crea el primer proceso del despacho para comenzar a organizar su información."}
            </p>

            {!query && !showArchived && (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white"
              >
                <Plus className="size-4" />
                Crear proceso
              </button>
            )}
          </div>
        )}
      </section>

      {/* MODAL CREAR PROCESO */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-process-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2
                  id="create-process-title"
                  className="text-base font-semibold text-[var(--foreground)]"
                >
                  Nuevo proceso
                </h2>

                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Registra un nuevo proceso en el despacho.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!working) {
                    setShowCreateModal(false);
                    setName("");
                    setDescription("");
                  }
                }}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={create}>
              <div className="space-y-4 p-5">
                <div>
                  <label
                    htmlFor="process-name"
                    className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
                  >
                    Nombre del proceso
                  </label>

                  <input
                    id="process-name"
                    required
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. Proceso ejecutivo Juan Pérez"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="process-description"
                    className="mb-1.5 block text-sm font-medium text-[var(--foreground)]"
                  >
                    Descripción
                    <span className="ml-1 font-normal text-[var(--foreground-muted)]">
                      (opcional)
                    </span>
                  </label>

                  <textarea
                    id="process-description"
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Descripción breve del proceso..."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={working}
                  onClick={() => {
                    setShowCreateModal(false);
                    setName("");
                    setDescription("");
                  }}
                  className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={working || !name.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium !text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {working && (
                    <Loader2 className="size-4 animate-spin" />
                  )}

                  {working ? "Creando..." : "Crear proceso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
