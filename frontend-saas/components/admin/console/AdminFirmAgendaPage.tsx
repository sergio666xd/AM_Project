"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type FirmTask = {
  id: number;
  titulo: string;
  descripcion: string | null;
  estado: "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";
  prioridad: "BAJA" | "MEDIA" | "ALTA" | "URGENTE";
  fecha_limite: string;
  responsable_id: number;
  responsable: string;
  cliente: string | null;
  proceso: string | null;
  radicado: string | null;
};
type Responsible = { id: number; nombre: string };
type AgendaResponse = { tareas: FirmTask[]; responsables: Responsible[] };
type ViewMode = "CALENDARIO" | "LISTADO";

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
  const [responsibleId, setResponsibleId] = useState("TODOS");
  const [status, setStatus] = useState<(typeof STATES)[number]>("TODAS");
  const [view, setView] = useState<ViewMode>("CALENDARIO");
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [data, setData] = useState<AgendaResponse>({ tareas: [], responsables: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    let active = true;
    const params = new URLSearchParams({ mes: month });
    if (responsibleId !== "TODOS") params.set("abogado_id", responsibleId);
    if (status !== "TODAS") params.set("estado", status);
    fetchApi(`/api/admin/agenda/tareas?${params}`, { method: "GET", token })
      .then((result: AgendaResponse) => {
        if (active) setData(result);
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
  }, [month, responsibleId, status, token]);

  const tasksByDay = new Map<string, FirmTask[]>();
  for (const task of data.tareas) {
    const key = taskDay(task.fecha_limite);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
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

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Panel Administrativo · Firma</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Agenda de la firma</h1>
          <p className="mt-1 text-sm text-foreground-muted">Tareas asignadas a abogados internos.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setLoading(true); setMonth((value) => addMonths(value, -1)); }} aria-label="Mes anterior" title="Mes anterior" className="grid size-10 place-items-center rounded-md border border-border hover:bg-surface-hover"><ChevronLeft className="size-4" /></button>
          <input type="month" aria-label="Mes de agenda" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value); }} className="h-10 rounded-md border border-border bg-surface px-3 text-sm" />
          <button type="button" onClick={() => { setLoading(true); setMonth((value) => addMonths(value, 1)); }} aria-label="Mes siguiente" title="Mes siguiente" className="grid size-10 place-items-center rounded-md border border-border hover:bg-surface-hover"><ChevronRight className="size-4" /></button>
          <button type="button" onClick={() => { setLoading(true); setMonth(monthInColombia(new Date())); }} className="h-10 rounded-md border border-border px-3 text-sm hover:bg-surface-hover">Hoy</button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-foreground-muted">Responsable
            <select value={responsibleId} onChange={(event) => { setLoading(true); setResponsibleId(event.target.value); }} className="h-9 min-w-48 rounded-md border border-border bg-surface px-2 text-sm text-foreground">
              <option value="TODOS">Todos los abogados internos</option>
              {data.responsables.map((lawyer) => <option key={lawyer.id} value={lawyer.id}>{lawyer.nombre}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-foreground-muted">Estado
            <select value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value as (typeof STATES)[number]); }} className="h-9 min-w-40 rounded-md border border-border bg-surface px-2 text-sm text-foreground">
              {STATES.map((value) => <option key={value} value={value}>{value === "TODAS" ? "Todos los estados" : statusLabel(value)}</option>)}
            </select>
          </label>
        </div>
        <div role="group" aria-label="Vista de agenda" className="inline-flex gap-1 rounded-md border border-border p-1">
          <button type="button" aria-pressed={view === "CALENDARIO"} onClick={() => setView("CALENDARIO")} aria-label="Vista calendario" title="Vista calendario" className={`grid size-8 place-items-center rounded ${view === "CALENDARIO" ? "bg-primary text-white" : "hover:bg-surface-hover"}`}><CalendarDays className="size-4" /></button>
          <button type="button" aria-pressed={view === "LISTADO"} onClick={() => setView("LISTADO")} aria-label="Vista listado" title="Vista listado" className={`grid size-8 place-items-center rounded ${view === "LISTADO" ? "bg-primary text-white" : "hover:bg-surface-hover"}`}><List className="size-4" /></button>
        </div>
      </div>

      {error && <p role="alert" className="border-l-2 border-danger px-3 py-2 text-sm text-danger">{error}</p>}
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-foreground-muted"><RefreshCw className="size-4 animate-spin" />Cargando agenda…</div> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold capitalize">{monthTitle}</h2>
            <p className="text-sm text-foreground-muted">{data.tareas.length} tarea(s)</p>
          </div>
          {view === "CALENDARIO" ? (
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
                        {dayTasks.map((task) => <button key={task.id} type="button" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="w-full rounded-sm border-l-2 border-primary bg-primary/5 px-2 py-1 text-left text-xs hover:bg-primary/10">
                          <span className="block truncate font-medium text-foreground">{task.titulo}</span>
                          <span className="block truncate text-foreground-muted">{task.responsable}</span>
                          {expandedTaskId === task.id && taskDetail(task)}
                        </button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border-y border-border">
              <table className="w-full min-w-220 text-left text-sm">
                <thead className="bg-surface-secondary text-xs text-foreground-muted"><tr><th className="px-3 py-2">Vencimiento</th><th className="px-3 py-2">Tarea</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Contexto</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Prioridad</th></tr></thead>
                <tbody>{data.tareas.map((task) => <tr key={task.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-3 py-2">{formatDue(task.fecha_limite)}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)} className="text-left font-medium text-primary hover:underline">{task.titulo}</button>{expandedTaskId === task.id && taskDetail(task)}</td>
                  <td className="px-3 py-2">{task.responsable}</td>
                  <td className="px-3 py-2 text-foreground-muted">{[task.cliente, task.proceso, task.radicado].filter(Boolean).join(" · ") || "Tarea general"}</td>
                  <td className="px-3 py-2">{statusLabel(task.estado)}</td>
                  <td className="px-3 py-2">{task.prioridad}</td>
                </tr>)}</tbody>
              </table>
              {data.tareas.length === 0 && <p className="px-3 py-8 text-center text-sm text-foreground-muted">No hay tareas para este mes y filtros.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
