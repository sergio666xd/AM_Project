"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, List, RefreshCw, ArrowRight } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

type AgendaData = {
  eventos: {
    id: number;
    titulo: string;
    descripcion?: string | null;
    tipo: string;
    fecha_inicio: string;
    proceso_id: number;
    proceso: string;
  }[];
  tareas: {
    id: number;
    titulo: string;
    fecha_limite: string;
    proceso_id: number;
    proceso: string;
  }[];
};

const dateText = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));

export default function CalendarioClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [data, setData] = useState<AgendaData>({ eventos: [], tareas: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [processFilter, setProcessFilter] = useState("TODOS");
  const [typeFilter, setTypeFilter] = useState("TODOS");

  useEffect(() => {
    if (!token || sessionLoading) return;
    let active = true;
    fetchApi("/api/expedientes/cliente/agenda?dias=180", { token })
      .then((result: AgendaData) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar el calendario.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, sessionLoading]);

  const tasks: CalendarTask[] = useMemo(
    () =>
      data.tareas.map((task) => ({
        id: task.id,
        titulo: task.titulo,
        estado: "PENDIENTE",
        prioridad: "MEDIA",
        fecha_limite: task.fecha_limite,
        href: `/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`,
      })),
    [data.tareas],
  );

  const entries = useMemo(
    () =>
      [
        ...data.eventos.map((event) => ({
          id: `evento-${event.id}`,
          title: event.titulo,
          detail: `${event.proceso} · ${event.tipo.replaceAll("_", " ")}`,
          date: event.fecha_inicio,
          description: event.descripcion,
          href: `/gestion-procesos/cliente/procesos/${event.proceso_id}`,
          kind: "Evento",
        })),
        ...data.tareas.map((task) => ({
          id: `tarea-${task.id}`,
          title: task.titulo,
          detail: task.proceso,
          date: task.fecha_limite,
          description: null,
          href: `/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`,
          kind: "Tarea",
        })),
      ]
        .filter((entry) => entry.date)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    [data],
  );

  const processNames = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.detail.split(" · ")[0]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [entries],
  );

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (processFilter === "TODOS" || entry.detail.split(" · ")[0] === processFilter) &&
          (typeFilter === "TODOS" || entry.kind === typeFilter),
      ),
    [entries, processFilter, typeFilter],
  );

  return (
    <section className="motion-swap mx-auto max-w-5xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Calendario"
        description="Citas, audiencias, reuniones y vencimientos asociados a tus procesos."
        action={
          <div className="inline-flex rounded-lg border border-border bg-surface-secondary p-1 shadow-2xs" role="group" aria-label="Vista de agenda">
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "list"
                  ? "bg-brand-900 text-white shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <List className="size-3.5" />
              Lista
            </button>
            <button
              type="button"
              aria-pressed={view === "calendar"}
              onClick={() => setView("calendar")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === "calendar"
                  ? "bg-brand-900 text-white shadow-xs"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <CalendarDays className="size-3.5" />
              Calendario
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}

      {loading || sessionLoading ? (
        <div className="motion-delayed-in grid min-h-48 place-items-center text-sm text-muted">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 animate-spin text-brand-700" />
            <span>Cargando agenda...</span>
          </div>
        </div>
      ) : view === "calendar" ? (
        <div className="motion-fade-in"><TaskMonthCalendar tasks={tasks} /></div>
      ) : (
        <section className="motion-fade-in overflow-hidden rounded-xl border border-border bg-surface shadow-xs" aria-label="Actividades próximas">
          <div className="space-y-3 border-b border-border bg-surface-secondary/40 px-4 py-3.5">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Agenda en lista</h2>
              <p className="mt-0.5 text-xs text-muted">Actividades y tareas ordenadas por fecha (hora de Colombia).</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label>
                <span className="sr-only">Filtrar por proceso</span>
                <select
                  value={processFilter}
                  onChange={(event) => setProcessFilter(event.target.value)}
                  className="min-h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                >
                  <option value="TODOS">Todos los procesos</option>
                  {processNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Filtrar por tipo de actividad</span>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="min-h-9 w-full rounded-lg border border-border bg-surface px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
                >
                  <option value="TODOS">Eventos y tareas</option>
                  <option value="Evento">Eventos</option>
                  <option value="Tarea">Tareas</option>
                </select>
              </label>
            </div>
          </div>

          {visibleEntries.length > 0 ? (
            <ul className="divide-y divide-border">
              {visibleEntries.map((entry) => (
                <li key={entry.id} className="flex gap-3.5 p-4 sm:items-center hover:bg-surface-hover/60 transition-colors">
                  <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    {entry.kind === "Tarea" ? <CheckSquare className="size-5" /> : <CalendarDays className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="normal">{entry.kind}</Badge>
                      <time className="text-xs text-muted font-medium">{dateText(entry.date)}</time>
                    </div>
                    <p className="mt-1 font-semibold text-sm text-foreground">{entry.title}</p>
                    <p className="text-xs text-muted mt-0.5">{entry.detail}</p>
                    {entry.description && (
                      <p className="mt-1 text-xs text-muted leading-relaxed">{entry.description}</p>
                    )}
                  </div>
                  <Link
                    className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-brand-700 hover:text-brand-900 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/60"
                    href={entry.href}
                  >
                    <span>{entry.kind === "Tarea" ? "Ver tarea" : "Ver proceso"}</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-12 text-center text-xs text-muted">
              {entries.length
                ? "No hay actividades para los filtros seleccionados."
                : "No tienes eventos ni tareas programadas en los próximos seis meses."}
            </div>
          )}
        </section>
      )}
      <p className="text-xs text-muted text-center">
        Este calendario muestra exclusivamente eventos y tareas que el despacho ha compartido con tu cuenta.
      </p>
    </section>
  );
}
