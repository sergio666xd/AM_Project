"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckSquare, List, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";

type AgendaData = {
  eventos: { id: number; titulo: string; descripcion?: string | null; tipo: string; fecha_inicio: string; proceso_id: number; proceso: string }[];
  tareas: { id: number; titulo: string; fecha_limite: string; proceso_id: number; proceso: string }[];
};

const dateText = (value: string) => new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
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
      .then((result: AgendaData) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar el calendario."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, sessionLoading]);

  const tasks: CalendarTask[] = useMemo(() => data.tareas.map((task) => ({
    id: task.id,
    titulo: task.titulo,
    estado: "PENDIENTE",
    prioridad: "MEDIA",
    fecha_limite: task.fecha_limite,
    href: `/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`,
  })), [data.tareas]);

  const entries = useMemo(() => [
    ...data.eventos.map((event) => ({ id: `evento-${event.id}`, title: event.titulo, detail: `${event.proceso} · ${event.tipo.replaceAll("_", " ")}`, date: event.fecha_inicio, description: event.descripcion, href: `/gestion-procesos/cliente/procesos/${event.proceso_id}`, kind: "Evento" })),
    ...data.tareas.map((task) => ({ id: `tarea-${task.id}`, title: task.titulo, detail: task.proceso, date: task.fecha_limite, description: null, href: `/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`, kind: "Tarea" })),
  ].filter((entry) => entry.date).sort((a, b) => Date.parse(a.date) - Date.parse(b.date)), [data]);
  const processNames = useMemo(() => Array.from(new Set(entries.map((entry) => entry.detail.split(" · ")[0]).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")), [entries]);
  const visibleEntries = useMemo(() => entries.filter((entry) => (processFilter === "TODOS" || entry.detail.split(" · ")[0] === processFilter) && (typeFilter === "TODOS" || entry.kind === typeFilter)), [entries, processFilter, typeFilter]);

  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-(--foreground-muted)">Portal del cliente</p><h1 className="mt-1 text-2xl font-semibold">Calendario</h1><p className="mt-1 text-sm text-(--foreground-muted)">Citas, reuniones y vencimientos asociados a tus procesos.</p></div>
        <div className="inline-flex rounded-lg border border-border bg-surface p-1" role="group" aria-label="Vista de agenda">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${view === "list" ? "bg-primary !text-white" : "text-foreground hover:bg-surface-hover"}`}><List className="size-4" />Lista</button>
          <button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm ${view === "calendar" ? "bg-primary !text-white" : "text-foreground hover:bg-surface-hover"}`}><CalendarDays className="size-4" />Calendario</button>
        </div>
      </header>
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {loading || sessionLoading ? <p className="grid min-h-48 place-items-center text-sm text-(--foreground-muted)"><RefreshCw className="mr-2 inline size-4 animate-spin" />Cargando agenda...</p> : view === "calendar" ? (
        <TaskMonthCalendar tasks={tasks} />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-label="Actividades próximas">
          <div className="space-y-3 border-b border-border px-4 py-3"><div><h2 className="font-semibold">Agenda en lista</h2><p className="mt-1 text-sm text-(--foreground-muted)">Actividades y tareas ordenadas por fecha, en hora de Colombia.</p></div><div className="grid gap-2 sm:grid-cols-2"><label><span className="sr-only">Filtrar por proceso</span><select value={processFilter} onChange={(event) => setProcessFilter(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="TODOS">Todos los procesos</option>{processNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label><span className="sr-only">Filtrar por tipo de actividad</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="TODOS">Eventos y tareas</option><option value="Evento">Eventos</option><option value="Tarea">Tareas</option></select></label></div></div>
          {visibleEntries.length ? <ul className="divide-y divide-border">{visibleEntries.map((entry) => <li key={entry.id} className="flex gap-3 p-4 sm:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{entry.kind === "Tarea" ? <CheckSquare className="size-5" /> : <CalendarDays className="size-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs">{entry.kind}</span><time className="text-xs text-(--foreground-muted)">{dateText(entry.date)}</time></div><p className="mt-1 font-medium">{entry.title}</p><p className="text-sm text-(--foreground-muted)">{entry.detail}</p>{entry.description && <p className="mt-1 text-sm">{entry.description}</p>}</div><Link className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-surface-hover" href={entry.href}>{entry.kind === "Tarea" ? "Ver tarea" : "Ver proceso"}</Link></li>)}</ul> : <p className="p-10 text-center text-sm text-(--foreground-muted)">{entries.length ? "No hay actividades para los filtros seleccionados." : "No tienes eventos ni tareas en los próximos seis meses."}</p>}
        </section>
      )}
      <p className="text-xs text-(--foreground-muted)">Este calendario muestra solamente eventos y tareas que el despacho ha compartido contigo.</p>
    </section>
  );
}
