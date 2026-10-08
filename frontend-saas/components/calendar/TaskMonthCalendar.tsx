"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

export type CalendarTask = {
  id: number;
  titulo: string;
  estado: string;
  prioridad?: string;
  fecha_limite: string | null;
  href?: string;
  soloFecha?: boolean;
};

const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const timeFormatter = new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" });

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskDayKey(value: string) {
  return dateKey(new Date(value));
}

export default function TaskMonthCalendar({ tasks }: { tasks: CalendarTask[] }) {
  const now = new Date();
  const today = dateKey(now);
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(today);
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - ((firstOfMonth.getDay() + 6) % 7));
  const dates = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const tasksByDay = new Map<string, CalendarTask[]>();
  for (const task of tasks) {
    if (!task.fecha_limite || Number.isNaN(Date.parse(task.fecha_limite))) continue;
    const key = taskDayKey(task.fecha_limite);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }
  const selectedTasks = tasksByDay.get(selectedDay) ?? [];
  const selectedDate = new Date(`${selectedDay}T12:00:00`);
  const monthTitle = monthFormatter.format(month);

  function moveMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function selectDate(date: Date) {
    setSelectedDay(dateKey(date));
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <section aria-label="Calendario de agenda" className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-[var(--foreground)]">Calendario de agenda</h2>
          <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Tareas, eventos y actuaciones registradas</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-hover)]"><ChevronLeft className="size-4" /></button>
          <p aria-live="polite" className="min-w-36 text-center text-sm font-semibold capitalize text-[var(--foreground)]">{monthTitle}</p>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="grid size-9 place-items-center rounded-md border border-[var(--border)] hover:bg-[var(--surface-hover)]"><ChevronRight className="size-4" /></button>
          <button type="button" onClick={() => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(today); }} className="rounded-md border border-[var(--border)] px-2.5 py-2 text-xs font-medium hover:bg-[var(--surface-hover)]">Hoy</button>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-secondary)]/50">
        {weekdays.map((day) => <div key={day} className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[var(--foreground-muted)] sm:text-xs">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dates.map((date) => {
          const key = dateKey(date);
          const dayTasks = tasksByDay.get(key) ?? [];
          const inMonth = date.getMonth() === month.getMonth();
          const selected = selectedDay === key;
          return (
            <button key={key} type="button" onClick={() => selectDate(date)} aria-pressed={selected} aria-label={`${dayFormatter.format(date)}, ${dayTasks.length} tarea${dayTasks.length === 1 ? "" : "s"}`} className={`flex min-h-[64px] flex-col items-center border-b border-r border-[var(--border)] p-1.5 text-sm transition sm:min-h-[76px] sm:p-2 ${!inMonth ? "text-[var(--foreground-muted)]/50" : "text-[var(--foreground)]"} ${selected ? "bg-[var(--primary)]/10 ring-1 ring-inset ring-[var(--primary)]" : "hover:bg-[var(--surface-hover)]"}`}>
              <span className={`grid size-7 place-items-center rounded-full text-xs ${key === today ? "bg-[var(--primary)] font-semibold text-white" : ""}`}>{date.getDate()}</span>
              {dayTasks.length > 0 && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]"><span className="size-1.5 rounded-full bg-[var(--primary)]" />{dayTasks.length}</span>}
            </button>
          );
        })}
      </div>
      <section aria-label={`Tareas del ${dayFormatter.format(selectedDate)}`} className="space-y-2 p-4 sm:p-5">
        <h3 className="text-sm font-semibold capitalize text-[var(--foreground)]">{dayFormatter.format(selectedDate)}</h3>
        {selectedTasks.length ? selectedTasks.map((task) => {
          const content = <><span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--foreground)]">{task.titulo}</span><span className="mt-0.5 block text-xs text-[var(--foreground-muted)]">{task.estado.replaceAll("_", " ")}{task.prioridad ? ` · ${task.prioridad.toLowerCase()}` : ""}</span></span>{!task.soloFecha && <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--foreground-muted)]"><Clock3 className="size-3.5" />{timeFormatter.format(new Date(task.fecha_limite!))}</span>}</>;
          return task.href ? <Link key={task.id} href={task.href} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2.5 transition hover:bg-[var(--surface-hover)]">{content}</Link> : <div key={task.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2.5">{content}</div>;
        }) : <p className="text-sm text-[var(--foreground-muted)]">No hay actividades este día.</p>}
      </section>
    </section>
  );
}
