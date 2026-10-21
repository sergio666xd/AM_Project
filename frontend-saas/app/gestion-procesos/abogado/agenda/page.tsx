"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Bell, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import TaskMonthCalendar, { type CalendarTask } from "@/components/calendar/TaskMonthCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Reminder = { id: number; activo: boolean; fecha_hora?: string | null };
type Task = {
  id: number;
  titulo: string;
  estado: "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
  fecha_limite?: string | null;
  proceso_id?: number | null;
  radicado_id?: number | null;
  cliente_id?: number | null;
  usuario_id: number;
  recordatorios: Reminder[];
};
type Process = { id: number; nombre: string };
type Client = { id: number; nombre_completo: string };
type Radicado = { id: number; numero: string };
type AgendaEvent = { id: number; titulo: string; descripcion?: string | null; tipo: "EVENTO" | "AUDIENCIA" | "REUNION" | "FIRMA_CONTRATO"; estado: "PROGRAMADO" | "COMPLETADO" | "CANCELADO"; fecha_inicio: string; proceso_id: number; proceso: string; cliente_id?: number | null; cliente?: string | null; responsable_id?: number | null };
type AgendaActuacion = { id: number; titulo: string; descripcion: string; fecha: string; proceso_id: number; proceso: string; abogado_id: number; cliente_ids: number[]; radicado_id: number; radicado: string };
type AgendaData = { tasks: Task[]; processes: Process[]; clients: Client[]; radicados: Radicado[]; events: AgendaEvent[]; actuaciones: AgendaActuacion[] };
type AgendaFilter = "TODAS" | "VENCIDAS" | "HOY" | "PROXIMAS";
type AgendaView = "DIA" | "SEMANA" | "MES" | "LISTA";

async function cargarAgenda(token: string): Promise<AgendaData> {
  const [tasks, processes, clients, radicados, events, actuaciones] = await Promise.all([
    fetchApi("/api/tareas", { method: "GET", token }),
    fetchApi("/api/expedientes/procesos", { method: "GET", token }),
    fetchApi("/api/expedientes/clientes", { method: "GET", token }),
    fetchApi("/api/radicados", { method: "GET", token }),
    fetchApi("/api/expedientes/agenda/eventos", { method: "GET", token }),
    fetchApi("/api/expedientes/agenda/actuaciones", { method: "GET", token }),
  ]);
  return { tasks, processes, clients, radicados, events, actuaciones };
}

function inicioDelDia(value: string) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function claveFecha(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function claveFechaIso(value: string) {
  return claveFecha(new Date(value));
}

function sumarDias(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return claveFecha(date);
}

function formatoFecha(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "long",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function etiquetaTipoEvento(tipo: AgendaEvent["tipo"]) {
  return { AUDIENCIA: "Audiencia", REUNION: "Reunión", FIRMA_CONTRATO: "Firma de contrato", EVENTO: "Evento" }[tipo];
}

function etiquetaPrioridad(priority: Task["prioridad"]) {
  return { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta", URGENTE: "Urgente" }[priority];
}

export default function AgendaPage() {
  const { token, user, loading: sessionLoading } = useSession();
  const [data, setData] = useState<AgendaData>({ tasks: [], processes: [], clients: [], radicados: [], events: [], actuaciones: [] });
  const [filter, setFilter] = useState<AgendaFilter>("TODAS");
  const [view, setView] = useState<AgendaView>("SEMANA");
  const [selectedDate, setSelectedDate] = useState(() => claveFecha(new Date()));
  const [responsibleFilter, setResponsibleFilter] = useState("TODOS");
  const [processFilter, setProcessFilter] = useState("TODOS");
  const [clientFilter, setClientFilter] = useState("TODOS");
  const [typeFilter, setTypeFilter] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    cargarAgenda(token)
      .then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la agenda."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionLoading, token]);

  async function actualizar() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setData(await cargarAgenda(token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  const tareasConVencimiento = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return data.tasks
      .filter((task) => task.fecha_limite && task.estado !== "COMPLETADA" && task.estado !== "CANCELADA")
      .filter((task) => {
        if (responsibleFilter === "YO" && task.usuario_id !== user?.id) return false;
        if (responsibleFilter === "OTROS" && task.usuario_id === user?.id) return false;
        if (processFilter !== "TODOS" && String(task.proceso_id || "") !== processFilter) return false;
        if (clientFilter !== "TODOS" && String(task.cliente_id || "") !== clientFilter) return false;
        const due = inicioDelDia(task.fecha_limite!);
        if (filter === "VENCIDAS") return due < today;
        if (filter === "HOY") return due.getTime() === today.getTime();
        if (filter === "PROXIMAS") return due >= today && due <= nextWeek;
        return true;
      })
      .sort((left, right) => new Date(left.fecha_limite!).getTime() - new Date(right.fecha_limite!).getTime());
  }, [data.tasks, filter, responsibleFilter, processFilter, clientFilter, user?.id]);

  const processes = new Map(data.processes.map((process) => [process.id, process.nombre]));
  const clients = new Map(data.clients.map((client) => [client.id, client.nombre_completo]));
  const radicados = new Map(data.radicados.map((radicado) => [radicado.id, radicado.numero]));
  const taskBase = user?.rol === "ABOGADO" ? "/gestion-procesos/dashboard/tareas" : "/gestion-procesos/abogado/tareas";
  const weekStart = (() => { const date = new Date(`${selectedDate}T12:00:00`); return sumarDias(selectedDate, -((date.getDay() + 6) % 7)); })();
  const taskItemsForView = view === "DIA" ? tareasConVencimiento.filter((task) => claveFechaIso(task.fecha_limite!) === selectedDate)
    : view === "SEMANA" ? tareasConVencimiento.filter((task) => { const date = claveFechaIso(task.fecha_limite!); return date >= weekStart && date <= sumarDias(weekStart, 6); })
    : view === "MES" ? tareasConVencimiento.filter((task) => claveFechaIso(task.fecha_limite!).slice(0, 7) === selectedDate.slice(0, 7)) : tareasConVencimiento;
  const filteredEvents = data.events.filter((event) => (processFilter === "TODOS" || String(event.proceso_id) === processFilter)
    && (clientFilter === "TODOS" || String(event.cliente_id || "") === clientFilter)
    && (responsibleFilter === "TODOS" || (responsibleFilter === "YO" ? event.responsable_id === user?.id : event.responsable_id !== user?.id))
    && (typeFilter === "TODOS" || event.tipo === typeFilter));
  const eventsForView = filteredEvents.filter((event) => view === "DIA" ? claveFechaIso(event.fecha_inicio) === selectedDate
    : view === "SEMANA" ? claveFechaIso(event.fecha_inicio) >= weekStart && claveFechaIso(event.fecha_inicio) <= sumarDias(weekStart, 6)
    : view === "MES" ? claveFechaIso(event.fecha_inicio).slice(0, 7) === selectedDate.slice(0, 7) : true);
  const filteredActuations = data.actuaciones.filter((item) => (processFilter === "TODOS" || String(item.proceso_id) === processFilter)
    && (clientFilter === "TODOS" || item.cliente_ids.includes(Number(clientFilter)))
    && (responsibleFilter === "TODOS" || (responsibleFilter === "YO" ? item.abogado_id === user?.id : item.abogado_id !== user?.id))
    && (typeFilter === "TODOS" || typeFilter === "ACTUACION"));
  const actuacionesForView = filteredActuations.filter((item) => view === "DIA" ? claveFechaIso(item.fecha) === selectedDate
    : view === "SEMANA" ? claveFechaIso(item.fecha) >= weekStart && claveFechaIso(item.fecha) <= sumarDias(weekStart, 6)
    : view === "MES" ? claveFechaIso(item.fecha).slice(0, 7) === selectedDate.slice(0, 7) : true);
  const calendarItems: CalendarTask[] = [
    ...tareasConVencimiento.map((task) => ({ id: task.id, titulo: task.titulo, estado: task.estado, prioridad: task.prioridad, fecha_limite: task.fecha_limite ?? null, href: `${taskBase}/${task.id}` })),
    ...filteredEvents.map((event) => ({ id: -event.id, titulo: `${etiquetaTipoEvento(event.tipo)}: ${event.titulo}`, estado: event.estado, fecha_limite: event.fecha_inicio, href: `/gestion-procesos/abogado/procesos/${event.proceso_id}/agenda` })),
    ...filteredActuations.map((item) => ({ id: -1000000 - item.id, titulo: `Actuación judicial: ${item.titulo}`, estado: "REGISTRADA", fecha_limite: item.fecha, href: `/gestion-procesos/abogado/procesos/${item.proceso_id}/actividad`, soloFecha: true })),
  ];
  const filters: { id: AgendaFilter; label: string }[] = [
    { id: "TODAS", label: "Todas" },
    { id: "VENCIDAS", label: "Vencidas" },
    { id: "HOY", label: "Hoy" },
    { id: "PROXIMAS", label: "Próximos 7 días" },
  ];
  const fechaColombia = (value: string) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" }).format(new Date(`${value}T12:00:00-05:00`));
  const activeRangeLabel = view === "DIA"
    ? fechaColombia(selectedDate)
    : view === "SEMANA"
      ? `${fechaColombia(weekStart)} – ${fechaColombia(sumarDias(weekStart, 6))}`
      : view === "MES"
        ? new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(`${selectedDate.slice(0, 7)}-15T12:00:00-05:00`))
        : "todas las fechas";
  const activeFilterCount = [responsibleFilter !== "TODOS", processFilter !== "TODOS", clientFilter !== "TODOS", typeFilter !== "TODOS"].filter(Boolean).length;

  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-24">
      <PageHeader
        overline="Trabajo jurídico"
        title="Agenda"
        description="Tareas, eventos y actuaciones judiciales de tus procesos."
        action={
          <Button
            variant="outline"
            onClick={() => void actualizar()}
            disabled={loading || sessionLoading}
            icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />}
          >
            Actualizar
          </Button>
        }
      />

      <div role="group" aria-label="Filtrar agenda" className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${filter === item.id ? "bg-brand-900 text-white" : "text-(--foreground-muted) hover:bg-surface-secondary"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <details className="rounded-lg border border-border bg-surface p-3">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium"><span>Filtros por equipo y proceso</span><span className="text-sm text-(--foreground-muted)">{activeFilterCount ? `${activeFilterCount} activos` : "Opcionales"}</span></summary>
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
        <select aria-label="Filtrar por responsable" value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} className="h-10 rounded-md border border-border bg-surface-secondary px-3 text-sm"><option value="TODOS">Todos los responsables</option><option value="YO">Asignados a mí</option><option value="OTROS">Otros responsables</option></select>
        <select aria-label="Filtrar por proceso" value={processFilter} onChange={(event) => setProcessFilter(event.target.value)} className="h-10 rounded-md border border-border bg-surface-secondary px-3 text-sm"><option value="TODOS">Todos los procesos</option>{data.processes.map((process) => <option key={process.id} value={process.id}>{process.nombre}</option>)}</select>
        <select aria-label="Filtrar por cliente" value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} className="h-10 rounded-md border border-border bg-surface-secondary px-3 text-sm"><option value="TODOS">Todos los clientes</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select>
        <select aria-label="Filtrar por tipo de evento" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-md border border-border bg-surface-secondary px-3 text-sm"><option value="TODOS">Todos los tipos</option><option value="AUDIENCIA">Audiencias</option><option value="REUNION">Reuniones</option><option value="FIRMA_CONTRATO">Firmas de contrato</option><option value="EVENTO">Eventos</option><option value="ACTUACION">Actuaciones judiciales</option></select>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"><div role="group" aria-label="Vista de agenda" className="flex gap-1">{(["DIA", "SEMANA", "MES", "LISTA"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => setView(mode)} className={`rounded-md px-3 py-1.5 text-sm ${view === mode ? "bg-primary !text-white" : "text-(--foreground-muted) hover:bg-surface-secondary"}`}>{mode === "DIA" ? "Día" : mode === "SEMANA" ? "Semana" : mode === "MES" ? "Mes" : "Lista"}</button>)}</div>{view === "MES" ? <input aria-label="Mes de agenda" type="month" value={selectedDate.slice(0, 7)} onChange={(event) => setSelectedDate(`${event.target.value}-01`)} className="h-9 rounded-md border border-border bg-surface-secondary px-3 text-sm" /> : view !== "LISTA" ? <input aria-label="Fecha de agenda" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="h-9 rounded-md border border-border bg-surface-secondary px-3 text-sm" /> : null}</div>

      {error && <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700"><AlertCircle className="size-4 shrink-0" />{error}</div>}

      {!loading && !sessionLoading && <p className="text-sm text-(--foreground-muted)">Rango consultado: <span className="font-medium text-foreground">{activeRangeLabel}</span></p>}
      {loading || sessionLoading ? <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-(--foreground-muted)"><RefreshCw className="size-5 animate-spin" />Cargando agenda...</div> : view === "MES" ? <TaskMonthCalendar tasks={calendarItems} /> : taskItemsForView.length || eventsForView.length || actuacionesForView.length ? <div className="space-y-2">
        {eventsForView.map((event) => <Link key={`event-${event.id}`} href={`/gestion-procesos/abogado/procesos/${event.proceso_id}/agenda`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 transition hover:bg-amber-500/10"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700"><CalendarDays className="size-4" /></div><div className="min-w-0"><p className="font-medium text-foreground">{etiquetaTipoEvento(event.tipo)}: {event.titulo}</p><p className="mt-1 text-xs text-(--foreground-muted)">{event.proceso}{event.cliente ? ` · ${event.cliente}` : ""}</p></div></div><span className="rounded-md bg-surface px-2 py-1 text-xs text-(--foreground-secondary)">{formatoFecha(event.fecha_inicio)}</span></Link>)}
        {actuacionesForView.map((item) => <Link key={`actuacion-${item.proceso_id}-${item.id}`} href={`/gestion-procesos/abogado/procesos/${item.proceso_id}/actividad`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 transition hover:bg-indigo-500/10"><div className="flex min-w-0 items-start gap-3"><div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-700"><CalendarDays className="size-4" /></div><div className="min-w-0"><p className="font-medium text-foreground">Actuación judicial: {item.titulo}</p><p className="mt-1 text-xs text-(--foreground-muted)">{item.proceso} · Radicado {item.radicado}{item.descripcion ? ` · ${item.descripcion}` : ""}</p></div></div><span className="rounded-md bg-surface px-2 py-1 text-xs text-(--foreground-secondary)">{new Date(item.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "2-digit", month: "short" })}</span></Link>)}
        {taskItemsForView.map((task) => {
          const due = inicioDelDia(task.fecha_limite!);
          const today = inicioDelDia(new Date().toISOString());
          const overdue = due < today;
          const activeReminders = task.recordatorios.filter((reminder) => reminder.activo).length;
          return <Link key={task.id} href={`${taskBase}/${task.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition hover:border-primary/40 hover:bg-surface-hover">
            <div className="flex min-w-0 items-start gap-3"><div className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${overdue ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}><CalendarDays className="size-4" /></div><div className="min-w-0"><p className="font-medium text-foreground">{task.titulo}</p><p className="mt-1 text-xs text-(--foreground-muted)">{[task.proceso_id ? processes.get(task.proceso_id) : null, task.radicado_id ? radicados.get(task.radicado_id) : null, task.cliente_id ? clients.get(task.cliente_id) : null].filter(Boolean).join(" · ") || "Tarea general"}</p></div></div>
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-md px-2 py-1 ${overdue ? "bg-red-500/10 text-red-700" : "bg-surface-secondary text-(--foreground-secondary)"}`}>{formatoFecha(task.fecha_limite!)}</span><span className="rounded-md bg-surface-secondary px-2 py-1 text-(--foreground-secondary)">{etiquetaPrioridad(task.prioridad)}</span>{activeReminders > 0 && <span title={`${activeReminders} recordatorio(s) activo(s)`} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-amber-700"><Bell className="size-3.5" />{activeReminders}</span>}<span className="inline-flex items-center gap-1 text-primary"><Clock3 className="size-3.5" />{task.estado === "EN_CURSO" ? "En curso" : "Pendiente"}</span></div>
          </Link>;
        })}
      </div> : <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 text-center"><CalendarDays className="size-8 text-(--foreground-muted)" /><h2 className="mt-3 font-semibold text-foreground">No hay actividades en esta vista</h2><p className="mt-1 text-sm text-(--foreground-muted)">Tareas y eventos del despacho aparecerán aquí.</p></div>}
    </section>
  );
}
