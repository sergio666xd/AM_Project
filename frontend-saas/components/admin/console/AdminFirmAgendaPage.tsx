"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { toDateTimeLocalInput } from "@/lib/labels";
import { Button } from "@/components/ui/Button";

type FirmTask = {
  id: number;
  titulo: string;
  descripcion: string | null;
  estado: "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
  fecha_limite: string;
  responsable_id: number;
  responsable: string;
  cliente_id: number | null;
  cliente: string | null;
  proceso_id: number | null;
  proceso: string | null;
  radicado: string | null;
};
type Responsible = { id: number; nombre: string };
type FirmReminder = { id: number; fecha_hora: string; tarea_id: number; tarea: string; responsable: string; proceso: string | null; cliente: string | null; canales: string[]; enviado: boolean };
type FirmEvent = { id: number; titulo: string; descripcion: string | null; tipo: "EVENTO" | "AUDIENCIA" | "REUNION"; estado: "PROGRAMADO" | "COMPLETADO" | "CANCELADO"; fecha_inicio: string; fecha_fin: string | null; responsable_id: number | null; responsable: string | null; proceso_id: number | null; proceso: string | null; cliente_id: number | null; cliente: string | null };
type EventDraft = { titulo: string; descripcion: string; tipo: FirmEvent["tipo"]; estado: FirmEvent["estado"]; fecha_inicio: string; responsable_id: string; proceso_id: string; cliente_id: string };
type AgendaResponse = { tareas: FirmTask[]; responsables: Responsible[]; eventos: FirmEvent[]; recordatorios: FirmReminder[] };
type ViewMode = "DIA" | "SEMANA" | "MES" | "LISTADO";
type ActivityFilter = "TODAS" | "TAREA" | "EVENTO" | "AUDIENCIA" | "REUNION";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const STATES = ["TODAS", "PENDIENTE", "EN_CURSO", "COMPLETADA", "CANCELADA"] as const;

function monthInColombia(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function taskDay(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDue(value: string) {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return date.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function addMonths(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateInColombia(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekRange(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const from = addDays(value, -offset);
  return [from, addDays(from, 6)] as const;
}

function statusLabel(status: FirmTask["estado"]) {
  return {
    PENDIENTE: "Pendiente",
    EN_CURSO: "En curso",
    COMPLETADA: "Completada",
    CANCELADA: "Cancelada",
  }[status];
}

export default function AdminFirmAgendaPage() {
  const { token } = useSession();
  const [month, setMonth] = useState(() => monthInColombia(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => dateInColombia(new Date()));
  const [responsibleId, setResponsibleId] = useState("TODOS");
  const [status, setStatus] = useState<(typeof STATES)[number]>("TODAS");
  const [view, setView] = useState<ViewMode>("MES");
  const [processId, setProcessId] = useState("TODOS");
  const [clientId, setClientId] = useState("TODOS");
  const [activityType, setActivityType] = useState<ActivityFilter>("TODAS");
  const [viewportReady, setViewportReady] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [selectedReminderIds, setSelectedReminderIds] = useState<number[]>([]);
  const [data, setData] = useState<AgendaResponse>({ tareas: [], responsables: [], eventos: [], recordatorios: [] });
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [eventDraft, setEventDraft] = useState<EventDraft>({ titulo: "", descripcion: "", tipo: "EVENTO", estado: "PROGRAMADO", fecha_inicio: "", responsable_id: "", proceso_id: "", cliente_id: "" });
  const [savingEvent, setSavingEvent] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el ancho de pantalla solo se conoce en el navegador, tras hidratar.
    if (window.matchMedia("(max-width: 767px)").matches) setView("LISTADO");
    setViewportReady(true);
  }, []);

  useEffect(() => {
    if (!token || !viewportReady) return;
    let active = true;
    const params = new URLSearchParams();
    if (view === "DIA") {
      params.set("fecha_desde", selectedDate);
      params.set("fecha_hasta", selectedDate);
    } else if (view === "SEMANA") {
      const [from, to] = weekRange(selectedDate);
      params.set("fecha_desde", from);
      params.set("fecha_hasta", to);
    } else {
      params.set("mes", month);
    }
    if (responsibleId !== "TODOS") params.set("abogado_id", responsibleId);
    if (processId !== "TODOS") params.set("proceso_id", processId);
    if (clientId !== "TODOS") params.set("cliente_id", clientId);
    if (status !== "TODAS") params.set("estado", status);
    const eventParams = new URLSearchParams();
    if (view === "DIA") { eventParams.set("fecha_desde", selectedDate); eventParams.set("fecha_hasta", selectedDate); }
    else if (view === "SEMANA") { const [from, to] = weekRange(selectedDate); eventParams.set("fecha_desde", from); eventParams.set("fecha_hasta", to); }
    else { const [year, monthNumber] = month.split("-").map(Number); eventParams.set("fecha_desde", `${month}-01`); eventParams.set("fecha_hasta", `${month}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, "0")}`); }
    if (responsibleId !== "TODOS") eventParams.set("responsable_id", responsibleId);
    if (processId !== "TODOS") eventParams.set("proceso_id", processId);
    if (clientId !== "TODOS") eventParams.set("cliente_id", clientId);
    if (status !== "TODAS") eventParams.set("estado", status);
    Promise.all([
      fetchApi(`/api/admin/agenda/tareas?${params}`, { method: "GET", token }),
      fetchApi(`/api/admin/agenda/eventos?${eventParams}`, { method: "GET", token }),
    ])
      .then(([taskData, eventos]: [AgendaResponse, FirmEvent[]]) => {
        if (active) setData({ ...taskData, eventos, recordatorios: taskData.recordatorios ?? [] });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar la agenda de firma.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [month, selectedDate, view, responsibleId, processId, clientId, status, token, refreshKey, viewportReady]);

  const tasksByDay = new Map<string, FirmTask[]>();
  for (const task of data.tareas) {
    const key = taskDay(task.fecha_limite);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }
  const eventsByDay = new Map<string, FirmEvent[]>();
  const visibleEvents = activityType === "TAREA" ? [] : data.eventos.filter((event) => activityType === "TODAS" || event.tipo === activityType);
  for (const event of visibleEvents) {
    const key = taskDay(event.fecha_inicio);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), event]);
  }
  const remindersByDay = new Map<string, FirmReminder[]>();
  for (const reminder of (activityType === "TODAS" || activityType === "TAREA" ? data.recordatorios : [])) {
    const key = taskDay(reminder.fecha_hora);
    remindersByDay.set(key, [...(remindersByDay.get(key) ?? []), reminder]);
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const offset = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const monthTitle = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  function taskDetail(task: FirmTask) {
    return (
      <div className="mt-2 space-y-1 border-l-2 border-primary/30 pl-3 text-xs text-foreground-muted">
        <p>Responsable: {task.responsable}</p>
        {task.cliente && <p>Cliente: {task.cliente}</p>}
        {task.proceso && <p>Proceso: {task.proceso}</p>}
        {task.radicado && <p>Radicado: {task.radicado}</p>}
        {task.descripcion && <p className="whitespace-pre-wrap">{task.descripcion}</p>}
      </div>
    );
  }

  function openNewEvent() {
    setEditingEventId(null);
    setEventDraft({ titulo: "", descripcion: "", tipo: "EVENTO", estado: "PROGRAMADO", fecha_inicio: `${selectedDate}T09:00`, responsable_id: responsibleId === "TODOS" ? "" : responsibleId, proceso_id: processId === "TODOS" ? "" : processId, cliente_id: clientId === "TODOS" ? "" : clientId });
    setError(""); setEventFormOpen(true);
  }

  function openEditEvent(event: FirmEvent) {
    setEditingEventId(event.id);
    setEventDraft({ titulo: event.titulo, descripcion: event.descripcion ?? "", tipo: event.tipo, estado: event.estado, fecha_inicio: toDateTimeLocalInput(event.fecha_inicio.endsWith("Z") ? event.fecha_inicio : `${event.fecha_inicio}Z`), responsable_id: String(event.responsable_id ?? ""), proceso_id: String(event.proceso_id ?? ""), cliente_id: String(event.cliente_id ?? "") });
    setEventFormOpen(true);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSavingEvent(true); setError("");
    const payload = { ...eventDraft, fecha_inicio: new Date(eventDraft.fecha_inicio).toISOString(), responsable_id: eventDraft.responsable_id ? Number(eventDraft.responsable_id) : null, proceso_id: eventDraft.proceso_id ? Number(eventDraft.proceso_id) : null, cliente_id: eventDraft.cliente_id ? Number(eventDraft.cliente_id) : null, fecha_fin: null };
    try {
      await fetchApi(editingEventId ? `/api/admin/agenda/eventos/${editingEventId}` : "/api/admin/agenda/eventos", { method: editingEventId ? "PATCH" : "POST", token, body: JSON.stringify(payload) });
      setEventFormOpen(false); setRefreshKey((key) => key + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible guardar el evento."); }
    finally { setSavingEvent(false); }
  }

  async function deleteEvent(event: FirmEvent) {
    if (!token || !window.confirm(`¿Eliminar “${event.titulo}” de la agenda?`)) return;
    try {
      await fetchApi(`/api/admin/agenda/eventos/${event.id}`, { method: "DELETE", token });
      setRefreshKey((key) => key + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible eliminar el evento."); }
  }

  async function deleteSelectedEvents() {
    const selected = visibleEvents.filter((event) => selectedEventIds.includes(event.id));
    if (!token || !selected.length || !window.confirm(`¿Eliminar ${selected.length} eventos seleccionados de la agenda?`)) return;
    setSavingEvent(true); setError("");
    const outcomes = await Promise.allSettled(selected.map((event) => fetchApi(`/api/admin/agenda/eventos/${event.id}`, { method: "DELETE", token })));
    const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;
    if (failed) setError(`${failed} evento(s) no se pudieron eliminar.`);
    setSelectedEventIds([]); setSavingEvent(false); setRefreshKey((key) => key + 1);
  }

  function exportSelectedAgendaRows() {
    const selectedTasks = (activityType === "TODAS" || activityType === "TAREA" ? data.tareas : []).filter((task) => selectedTaskIds.includes(task.id));
    const selectedReminders = (activityType === "TODAS" || activityType === "TAREA" ? data.recordatorios : []).filter((reminder) => selectedReminderIds.includes(reminder.id));
    const selectedEvents = visibleEvents.filter((event) => selectedEventIds.includes(event.id));
    if (!selectedTasks.length && !selectedReminders.length && !selectedEvents.length) return;
    const rows = [
      ["Tipo", "Título", "Responsable", "Fecha", "Estado", "Contexto"],
      ...selectedTasks.map((task) => ["Tarea", task.titulo, task.responsable, task.fecha_limite, task.estado, [task.proceso, task.cliente, task.radicado].filter(Boolean).join(" · ")]),
      ...selectedReminders.map((reminder) => ["Recordatorio", reminder.tarea, reminder.responsable, reminder.fecha_hora, reminder.enviado ? "Enviado" : "Programado", [reminder.proceso, reminder.cliente].filter(Boolean).join(" · ")]),
      ...selectedEvents.map((event) => [event.tipo, event.titulo, event.responsable ?? "", event.fecha_inicio, event.estado, [event.proceso, event.cliente].filter(Boolean).join(" · ")]),
    ];
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = rows.map((row) => row.map(quote).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = "agenda-seleccion.csv"; anchor.click(); URL.revokeObjectURL(url);
    setSelectedTaskIds([]); setSelectedReminderIds([]); setSelectedEventIds([]);
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Panel Administrativo · Firma"
        title="Agenda de la firma"
        description="Tareas asignadas a abogados internos."
        action={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={openNewEvent} icon={<CalendarDays className="size-4" />}>
              Nuevo evento
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setLoading(true); if (view === "MES" || view === "LISTADO") setMonth((value) => addMonths(value, -1)); else setSelectedDate((value) => addDays(value, view === "SEMANA" ? -7 : -1)); }}
              aria-label="Periodo anterior"
              title="Periodo anterior"
              icon={<ChevronLeft className="size-4" />}
            />
            {view === "MES" || view === "LISTADO" ? (
              <input type="month" aria-label="Mes de agenda" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value); }} className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
            ) : (
              <input type="date" aria-label="Día de agenda" value={selectedDate} onChange={(event) => { setLoading(true); setSelectedDate(event.target.value); }} className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setLoading(true); if (view === "MES" || view === "LISTADO") setMonth((value) => addMonths(value, 1)); else setSelectedDate((value) => addDays(value, view === "SEMANA" ? 7 : 1)); }}
              aria-label="Periodo siguiente"
              title="Periodo siguiente"
              icon={<ChevronRight className="size-4" />}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setLoading(true); const today = dateInColombia(new Date()); setSelectedDate(today); setMonth(monthInColombia(new Date())); }}
            >
              Hoy
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-foreground-muted">Responsable
            <select value={responsibleId} onChange={(event) => { setLoading(true); setResponsibleId(event.target.value); }} className="min-h-11 min-w-48 rounded-md border border-border bg-surface px-2 text-sm text-foreground">
              <option value="TODOS">Todos los abogados internos</option>
              {data.responsables.map((lawyer) => <option key={lawyer.id} value={lawyer.id}>{lawyer.nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-foreground-muted">Estado
            <select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value as (typeof STATES)[number]); }} className="min-h-11 min-w-40 rounded-md border border-border bg-surface px-2 text-sm text-foreground">
              {STATES.map((value) => <option key={value} value={value}>{value === "TODAS" ? "Todos los estados" : statusLabel(value)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-foreground-muted">Proceso
            <select value={processId} onChange={(event) => { setLoading(true); setProcessId(event.target.value); }} className="h-9 min-w-40 rounded-md border border-border bg-surface px-2 text-sm text-foreground"><option value="TODOS">Todos</option>{[...new Map(data.tareas.filter((task) => task.proceso_id && task.proceso).map((task) => [task.proceso_id, task.proceso])).entries()].map(([id, name]) => <option key={id} value={id!}>{name}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs text-foreground-muted">Cliente
            <select value={clientId} onChange={(event) => { setLoading(true); setClientId(event.target.value); }} className="h-9 min-w-40 rounded-md border border-border bg-surface px-2 text-sm text-foreground"><option value="TODOS">Todos</option>{[...new Map(data.tareas.filter((task) => task.cliente_id && task.cliente).map((task) => [task.cliente_id, task.cliente])).entries()].map(([id, name]) => <option key={id} value={id!}>{name}</option>)}</select>
          </label>
          <label className="grid gap-1 text-xs text-foreground-muted">Tipo de actividad
            <select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityFilter)} className="h-9 min-w-40 rounded-md border border-border bg-surface px-2 text-sm text-foreground"><option value="TODAS">Todas</option><option value="TAREA">Tareas y vencimientos</option><option value="EVENTO">Eventos</option><option value="AUDIENCIA">Audiencias</option><option value="REUNION">Reuniones</option></select>
          </label>
        </div>
        <div role="group" aria-label="Vista de agenda" className="inline-flex gap-1 rounded-md border border-border p-1">
          {(["DIA", "SEMANA", "MES", "LISTADO"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => { setLoading(true); setView(mode); }} className={`rounded px-2 py-1.5 text-xs ${view === mode ? "bg-brand-900 text-white" : "hover:bg-surface-hover"}`}>{mode === "DIA" ? "Día" : mode === "SEMANA" ? "Semana" : mode === "MES" ? "Mes" : <List className="size-4" aria-label="Listado" />}</button>)}
        </div>
      </div>

      {error && <p role="alert" className="border-l-2 border-danger px-3 py-2 text-sm text-danger">{error}</p>}
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-foreground-muted"><RefreshCw className="size-4 animate-spin" />Cargando agenda…</div> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold capitalize">{view === "DIA" ? new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("es-CO", { dateStyle: "full", timeZone: "UTC" }) : view === "SEMANA" ? `${weekRange(selectedDate)[0]} — ${weekRange(selectedDate)[1]}` : monthTitle}</h2>
            <p className="text-sm text-foreground-muted">{(activityType === "TODAS" || activityType === "TAREA" ? data.tareas.length + data.recordatorios.length : 0) + visibleEvents.length} actividad(es)</p>
          </div>
          {view === "MES" ? (
            <div className="overflow-x-auto border border-border">
              <div className="grid min-w-220 grid-cols-7">
                {WEEKDAYS.map((day) => <div key={day} className="border-b border-r border-border bg-surface-secondary px-2 py-2 text-xs font-semibold text-foreground-muted">{day}</div>)}
                {Array.from({ length: cellCount }, (_, index) => {
                  const day = index - offset + 1;
                  if (day < 1 || day > daysInMonth) return <div key={`empty-${index}`} className="min-h-28 border-b border-r border-border bg-background-secondary/50" />;
                  const key = `${month}-${String(day).padStart(2, "0")}`;
                  const dayTasks = tasksByDay.get(key) ?? [];
                  return (
                    <div key={key} className="min-h-28 border-b border-r border-border p-2">
                      <p className="mb-1 text-xs font-medium text-foreground-muted">{day}</p>
                      <div className="space-y-1">
                        {(activityType === "TODAS" || activityType === "TAREA") && dayTasks.map((task) => <button key={`task-${task.id}`} type="button" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="w-full rounded-sm border-l-2 border-primary bg-brand-50 px-2 py-1 text-left text-xs hover:bg-primary/10">
                          <span className="block truncate font-medium text-foreground">{task.titulo}</span>
                          <span className="block truncate text-foreground-muted">{task.responsable}</span>
                          {expandedTaskId === task.id && taskDetail(task)}
                        </button>)}
                        {(remindersByDay.get(key) ?? []).map((reminder) => <div key={`reminder-${reminder.id}`} className="w-full rounded-sm border-l-2 border-warning bg-warning-light px-2 py-1 text-xs text-foreground"><span className="block truncate font-medium">Recordatorio: {reminder.tarea}</span><span className="block truncate text-foreground-muted">{formatDue(reminder.fecha_hora)} · {reminder.canales.join(" / ") || "Sin canal"}{reminder.enviado ? " · Enviado" : ""}</span></div>)}
                        {(eventsByDay.get(key) ?? []).map((event) => <button key={`event-${event.id}`} type="button" onClick={() => openEditEvent(event)} className="w-full rounded-sm border-l-2 border-warning bg-warning-light px-2 py-1 text-left text-xs text-foreground hover:opacity-80"><span className="block truncate font-medium">{event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento"}: {event.titulo}</span><span className="block truncate text-foreground-muted">{event.responsable || "Sin responsable"}</span></button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : view === "DIA" || view === "SEMANA" ? (
            <div className="overflow-x-auto border border-border">
              <div className={`grid ${view === "DIA" ? "min-w-96" : "min-w-[70rem]"}`} style={{ gridTemplateColumns: `repeat(${view === "DIA" ? 1 : 7}, minmax(0, 1fr))` }}>
                {Array.from({ length: view === "DIA" ? 1 : 7 }, (_, index) => {
                  const key = view === "DIA" ? selectedDate : addDays(weekRange(selectedDate)[0], index);
                  const dayTasks = tasksByDay.get(key) ?? [];
                  return <div key={key} className="min-h-80 border-r border-border p-3 last:border-r-0">
                    <h3 className="mb-3 border-b border-border pb-2 text-sm font-semibold">{new Date(`${key}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</h3>
                    {dayTasks.length || eventsByDay.has(key) || remindersByDay.has(key) ? <div className="space-y-2">{(activityType === "TODAS" || activityType === "TAREA") && dayTasks.map((task) => <button key={`task-${task.id}`} type="button" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="w-full rounded-md border border-border border-l-4 border-l-primary bg-surface p-2 text-left text-xs hover:bg-surface-hover"><span className="block font-semibold">{task.titulo}</span><span className="mt-1 block text-foreground-muted">{task.responsable}</span>{expandedTaskId === task.id && taskDetail(task)}</button>)}{(remindersByDay.get(key) ?? []).map((reminder) => <div key={`reminder-${reminder.id}`} className="rounded-md border border-border border-l-4 border-l-warning bg-surface p-2 text-xs"><span className="block font-semibold">Recordatorio: {reminder.tarea}</span><span className="mt-1 block text-foreground-muted">{formatDue(reminder.fecha_hora)} · {reminder.canales.join(" / ") || "Sin canal"}{reminder.enviado ? " · Enviado" : ""}</span></div>)}{(eventsByDay.get(key) ?? []).map((event) => <button key={`event-${event.id}`} type="button" onClick={() => openEditEvent(event)} className="w-full rounded-md border border-border border-l-4 border-l-warning bg-surface p-2 text-left text-xs hover:bg-surface-hover"><span className="block font-semibold">{event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento"}: {event.titulo}</span><span className="mt-1 block text-foreground-muted">{event.responsable || "Sin responsable"}</span></button>)}</div> : <p className="text-xs text-foreground-muted">Sin actividades programadas.</p>}
                  </div>;
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border-y border-border">
              <div className="flex flex-wrap items-center gap-3 border-b border-border py-3"><span className="text-sm text-foreground-muted">{(activityType === "TODAS" || activityType === "TAREA" ? selectedTaskIds.length + selectedReminderIds.length : 0) + selectedEventIds.filter((id) => visibleEvents.some((item) => item.id === id)).length} seleccionados</span><button type="button" disabled={!(activityType === "TODAS" || activityType === "TAREA" ? selectedTaskIds.length + selectedReminderIds.length : 0) && !selectedEventIds.some((id) => visibleEvents.some((item) => item.id === id))} onClick={exportSelectedAgendaRows} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">Exportar selección CSV</button><button type="button" onClick={() => { setSelectedTaskIds(activityType === "TODAS" || activityType === "TAREA" ? data.tareas.map((item) => item.id) : []); setSelectedReminderIds(activityType === "TODAS" || activityType === "TAREA" ? data.recordatorios.map((item) => item.id) : []); setSelectedEventIds(visibleEvents.map((item) => item.id)); }} className="rounded-md border border-border px-3 py-2 text-xs">Seleccionar actividades visibles</button><button type="button" disabled={savingEvent || !selectedEventIds.some((id) => visibleEvents.some((item) => item.id === id))} onClick={() => void deleteSelectedEvents()} className="ml-auto rounded-md border border-danger/30 px-3 py-2 text-xs text-danger disabled:opacity-50">Eliminar eventos seleccionados</button></div>
              <table className="w-full min-w-220 text-left text-sm">
                <thead className="bg-surface-secondary text-xs text-foreground-muted"><tr><th className="px-3 py-2"><span className="sr-only">Selección</span></th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Actividad</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Contexto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Prioridad / Tipo</th><th className="px-3 py-2">Acciones</th></tr></thead>
                <tbody>{(activityType === "TODAS" || activityType === "TAREA") && data.tareas.map((task) => <tr key={`task-${task.id}`} className="border-t border-border align-top">
                  <td className="px-3 py-2"><input type="checkbox" checked={selectedTaskIds.includes(task.id)} onChange={() => setSelectedTaskIds((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])} aria-label={`Seleccionar tarea ${task.titulo}`} /></td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDue(task.fecha_limite)}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="text-left font-medium text-primary hover:underline">{task.titulo}</button>{expandedTaskId === task.id && taskDetail(task)}</td>
                  <td className="px-3 py-2">{task.responsable}</td>
                  <td className="px-3 py-2 text-foreground-muted">{[task.cliente, task.proceso, task.radicado].filter(Boolean).join(" · ") || "Tarea general"}</td>
                  <td className="px-3 py-2">{statusLabel(task.estado)}</td>
                  <td className="px-3 py-2">{task.prioridad}</td><td />
                </tr>)}</tbody>
                <tbody>{(activityType === "TODAS" || activityType === "TAREA") && data.recordatorios.map((reminder) => <tr key={`reminder-${reminder.id}`} className="border-t border-border align-top"><td className="px-3 py-2"><input type="checkbox" checked={selectedReminderIds.includes(reminder.id)} onChange={() => setSelectedReminderIds((current) => current.includes(reminder.id) ? current.filter((id) => id !== reminder.id) : [...current, reminder.id])} aria-label={`Seleccionar recordatorio ${reminder.tarea}`} /></td><td className="whitespace-nowrap px-3 py-2">{formatDue(reminder.fecha_hora)}</td><td className="px-3 py-2 font-medium"><button type="button" onClick={() => setExpandedTaskId(reminder.tarea_id)} className="text-left text-primary hover:underline">Recordatorio: {reminder.tarea}</button>{expandedTaskId === reminder.tarea_id && data.tareas.find((task) => task.id === reminder.tarea_id) && taskDetail(data.tareas.find((task) => task.id === reminder.tarea_id)!)}</td><td className="px-3 py-2">{reminder.responsable}</td><td className="px-3 py-2 text-foreground-muted">{[reminder.cliente, reminder.proceso].filter(Boolean).join(" · ") || "Tarea general"}</td><td className="px-3 py-2">{reminder.enviado ? "Enviado" : "Programado"}</td><td className="px-3 py-2">{reminder.canales.join(" / ") || "Sin canal"}</td><td /></tr>)}</tbody>
                <tbody>{visibleEvents.map((event) => <tr key={`event-${event.id}`} className="border-t border-border align-top"><td className="px-3 py-2"><input type="checkbox" checked={selectedEventIds.includes(event.id)} onChange={() => setSelectedEventIds((current) => current.includes(event.id) ? current.filter((id) => id !== event.id) : [...current, event.id])} aria-label={`Seleccionar ${event.titulo}`} /></td><td className="whitespace-nowrap px-3 py-2">{formatDue(event.fecha_inicio)}</td><td className="px-3 py-2 font-medium"><button type="button" onClick={() => openEditEvent(event)} className="text-left text-primary hover:underline">{event.tipo === "AUDIENCIA" ? "Audiencia" : event.tipo === "REUNION" ? "Reunión" : "Evento"}: {event.titulo}</button></td><td className="px-3 py-2">{event.responsable || "Sin responsable"}</td><td className="px-3 py-2">{[event.cliente, event.proceso].filter(Boolean).join(" · ") || "Evento general"}</td><td className="px-3 py-2">{event.estado === "PROGRAMADO" ? "Programado" : event.estado === "COMPLETADO" ? "Completado" : "Cancelado"}</td><td className="px-3 py-2">{event.tipo}</td><td className="px-3 py-2"><div className="flex gap-2"><button type="button" onClick={() => openEditEvent(event)} className="text-primary underline">Editar</button><button type="button" onClick={() => void deleteEvent(event)} className="text-danger underline">Eliminar</button></div></td></tr>)}</tbody>
              </table>
              {(activityType === "TODAS" || activityType === "TAREA" ? data.tareas.length + data.recordatorios.length : 0) + visibleEvents.length === 0 && <p className="px-3 py-8 text-center text-sm text-foreground-muted">No hay actividades para este periodo y filtros.</p>}
            </div>
          )}
        </>
      )}
      {eventFormOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-brand-950/40 backdrop-blur-sm p-4"><form onSubmit={(event) => void saveEvent(event)} className="w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 shadow-xl"><div><h2 className="text-lg font-semibold">{editingEventId ? "Editar actividad" : "Nuevo evento de agenda"}</h2><p className="text-sm text-foreground-muted">Registra eventos, audiencias y reuniones de la firma.</p></div><label className="block text-sm font-medium">Título<input required maxLength={255} value={eventDraft.titulo} onChange={(event) => setEventDraft({ ...eventDraft, titulo: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Tipo<select value={eventDraft.tipo} onChange={(event) => setEventDraft({ ...eventDraft, tipo: event.target.value as FirmEvent["tipo"] })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"><option value="EVENTO">Evento</option><option value="AUDIENCIA">Audiencia</option><option value="REUNION">Reunión</option></select></label><label className="text-sm font-medium">Estado<select value={eventDraft.estado} onChange={(event) => setEventDraft({ ...eventDraft, estado: event.target.value as FirmEvent["estado"] })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"><option value="PROGRAMADO">Programado</option><option value="COMPLETADO">Completado</option><option value="CANCELADO">Cancelado</option></select></label></div><label className="block text-sm font-medium">Fecha y hora<input required type="datetime-local" value={eventDraft.fecha_inicio} onChange={(event) => setEventDraft({ ...eventDraft, fecha_inicio: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3" /></label><label className="block text-sm font-medium">Responsable<select value={eventDraft.responsable_id} onChange={(event) => setEventDraft({ ...eventDraft, responsable_id: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"><option value="">Sin responsable</option>{data.responsables.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Proceso<select value={eventDraft.proceso_id} onChange={(event) => setEventDraft({ ...eventDraft, proceso_id: event.target.value, cliente_id: "" })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"><option value="">Sin proceso</option>{[...new Map([...data.tareas.map((item) => ({ id: item.proceso_id, nombre: item.proceso })), ...data.eventos.map((item) => ({ id: item.proceso_id, nombre: item.proceso }))].filter((item) => item.id && item.nombre).map((item) => [item.id, item.nombre])).entries()].map(([id, nombre]) => <option key={id} value={id!}>{nombre}</option>)}</select></label><label className="text-sm font-medium">Cliente<select value={eventDraft.cliente_id} onChange={(event) => setEventDraft({ ...eventDraft, cliente_id: event.target.value })} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"><option value="">Sin cliente</option>{[...new Map([...data.tareas.map((item) => ({ id: item.cliente_id, nombre: item.cliente, proceso_id: item.proceso_id })), ...data.eventos.map((item) => ({ id: item.cliente_id, nombre: item.cliente, proceso_id: item.proceso_id }))].filter((item) => item.id && item.nombre && (!eventDraft.proceso_id || String(item.proceso_id) === eventDraft.proceso_id)).map((item) => [item.id, item.nombre])).entries()].map(([id, nombre]) => <option key={id} value={id!}>{nombre}</option>)}</select></label></div><label className="block text-sm font-medium">Descripción<textarea rows={3} maxLength={4000} value={eventDraft.descripcion} onChange={(event) => setEventDraft({ ...eventDraft, descripcion: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2" /></label>{error && <p role="alert" className="text-sm text-danger">{error}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setEventFormOpen(false)} className="h-10 rounded-md border border-border px-3 text-sm">Cancelar</button><button type="submit" disabled={savingEvent} className="h-10 rounded-md bg-primary px-4 text-sm font-semibold !text-white disabled:opacity-50">{savingEvent ? "Guardando…" : "Guardar"}</button></div></form></div>}
    </section>
  );
}
