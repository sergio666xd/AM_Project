"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Clock3, ListChecks, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import TaskMonthCalendar, {
  type CalendarTask,
} from "@/components/calendar/TaskMonthCalendar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";

type Task = CalendarTask & {
  proceso_id?: number | null;
  cliente_id?: number | null;
  descripcion?: string | null;
  completada_en?: string | null;
  subtareas: {
    id: number;
    titulo: string;
    completada: boolean;
    completada_en?: string | null;
    proceso_id?: number | null;
    radicado_id?: number | null;
    actuacion_id?: number | null;
  }[];
};
type ClientProcess = { id: number; nombre: string };

function fechaLocalParaInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isOverdue(value?: string | null) {
  return Boolean(value && Date.parse(value) < Date.now());
}

async function loadTasks(token: string): Promise<Task[]> {
  return fetchApi("/api/tareas", { method: "GET", token });
}

export default function TareasClientePage() {
  const { user, token, loading: sessionLoading } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [processes, setProcesses] = useState<ClientProcess[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [workingSubtaskId, setWorkingSubtaskId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null);
  const [processFilter, setProcessFilter] = useState("TODOS");
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<number, string>>({});
  const [deadlineBusyId, setDeadlineBusyId] = useState<number | null>(null);

  const isMainTaskAssignedToClient = (task: Task) => Boolean(user && task.cliente_id === user.id);
  const canClientManageMainTask = (task: Task) => isMainTaskAssignedToClient(task) && task.estado !== "COMPLETADA" && task.estado !== "CANCELADA";

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    Promise.all([loadTasks(token), fetchApi("/api/expedientes/procesos", { token }) as Promise<ClientProcess[]>])
      .then(([result, processList]) => {
        if (!active) return;
        setTasks(result);
        setProcesses(processList);
        const requestedId = Number(new URLSearchParams(window.location.search).get("tarea"));
        if (Number.isInteger(requestedId) && requestedId > 0) setFocusedTaskId(requestedId);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar tus tareas.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoading, token]);

  useEffect(() => {
    if (!focusedTaskId || !tasks.length) return;
    document.getElementById(`tarea-${focusedTaskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedTaskId, tasks]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setTasks(await loadTasks(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar tus tareas.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function complete(taskId: number) {
    if (!token) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || !canClientManageMainTask(task)) return;
    setWorkingId(taskId);
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/tareas/${taskId}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ estado: "COMPLETADA" }),
      });
      setTasks((current) =>
        current.map((task) =>
          task.id === taskId
            ? {
                ...task,
                estado: "COMPLETADA",
                completada_en: new Date().toISOString(),
              }
            : task,
        ),
      );
      setNotice("Tarea marcada como completada.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible completar la tarea.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function updateDeadline(task: Task) {
    if (!token || !canClientManageMainTask(task)) return;
    const localValue = deadlineDrafts[task.id] ?? fechaLocalParaInput(task.fecha_limite);
    const date = new Date(localValue);
    if (!localValue || Number.isNaN(date.getTime())) {
      setError("Elige una fecha y hora válida para reprogramar la tarea.");
      return;
    }
    setDeadlineBusyId(task.id);
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/tareas/${task.id}`, {
        method: "PUT", token, body: JSON.stringify({ fecha_limite: date.toISOString() }),
      });
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, fecha_limite: date.toISOString() } : item));
      setDeadlineDrafts((current) => ({ ...current, [task.id]: "" }));
      setNotice("Fecha actualizada. Los avisos programados se reprogramaron.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cambiar la fecha.");
    } finally { setDeadlineBusyId(null); }
  }

  async function completeSubtask(taskId: number, subtaskId: number) {
    if (!token) return;
    setWorkingSubtaskId(subtaskId);
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/tareas/${taskId}/subtareas/${subtaskId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ completada: true }),
      });
      const completedAt = new Date().toISOString();
      setTasks((current) =>
        current.map((task) =>
          task.id !== taskId
            ? task
            : {
                ...task,
                subtareas: task.subtareas.map((subtask) =>
                  subtask.id === subtaskId
                    ? {
                        ...subtask,
                        completada: true,
                        completada_en: completedAt,
                      }
                    : subtask,
                ),
              },
        ),
      );
      setNotice("Subtarea marcada como completada.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible completar la subtarea.",
      );
    } finally {
      setWorkingSubtaskId(null);
    }
  }

  const visibleTasks = useMemo(() => processFilter === "TODOS" ? tasks : tasks.filter((task) => String(task.proceso_id ?? "GENERAL") === processFilter), [tasks, processFilter]);
  const openTasks = useMemo(
    () =>
      visibleTasks.filter(
        (task) =>
          (task.cliente_id === user?.id && task.estado !== "COMPLETADA" && task.estado !== "CANCELADA") ||
          task.subtareas.some((subtask) => !subtask.completada),
      ),
    [visibleTasks, user?.id],
  );
  const completedTasks = visibleTasks.filter((task) => task.estado === "COMPLETADA" && task.subtareas.every((subtask) => subtask.completada));
  const processNames = new Map(processes.map((process) => [process.id, process.nombre]));
  const calendarTasks: CalendarTask[] = visibleTasks
    .filter((task) => task.fecha_limite)
    .map((task) => ({
      id: task.id,
      titulo: task.titulo,
      estado: task.estado,
      prioridad: task.prioridad,
      fecha_limite: task.fecha_limite,
      href: `/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`,
    }));
  const upcomingByDate = Array.from(calendarTasks.reduce((groups, task) => {
    if (!task.fecha_limite || task.estado === "COMPLETADA" || task.estado === "CANCELADA" || isOverdue(task.fecha_limite)) return groups;
    const dateParts = new Intl.DateTimeFormat("en", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(task.fecha_limite));
    const part = (type: string) => dateParts.find((item) => item.type === type)?.value ?? "";
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    const group = groups.get(date) ?? [];
    group.push(task);
    groups.set(date, group);
    return groups;
  }, new Map<string, CalendarTask[]>())).sort(([left], [right]) => left.localeCompare(right)).slice(0, 6);

  return (
    <section className="motion-swap mx-auto max-w-5xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Mis tareas"
        description="Revisa los vencimientos y completa únicamente las tareas o subtareas que te asignaron."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {processes.length > 0 && (
              <select
                value={processFilter}
                onChange={(event) => setProcessFilter(event.target.value)}
                aria-label="Filtrar tareas por proceso"
                className="min-h-9 rounded-lg border border-border bg-surface-secondary px-3 text-xs text-foreground focus:border-brand-500 focus:outline-none"
              >
                <option value="TODOS">Todos los procesos</option>
                <option value="GENERAL">Tareas generales</option>
                {processes.map((process) => (
                  <option key={process.id} value={String(process.id)}>
                    {process.nombre}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              loading={loading || sessionLoading}
              icon={<RefreshCw className="size-4" />}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-completed/30 bg-completed/10 p-3.5 text-sm font-medium text-completed">
          {notice}
        </div>
      )}
      {loading || sessionLoading ? (
        <div className="grid min-h-48 place-items-center gap-3 text-sm text-(--foreground-muted)">
          <RefreshCw className="size-5 animate-spin" />
          Cargando tareas...
        </div>
      ) : (
        <>
          <div className="hidden md:block"><TaskMonthCalendar tasks={calendarTasks} /></div>
          {upcomingByDate.length > 0 && <section className="rounded-lg border border-border bg-surface p-4 md:hidden" aria-label="Fechas próximas"><h2 className="font-semibold">Fechas próximas</h2><p className="mt-1 text-sm text-(--foreground-muted)">Resumen de vencimientos; abre una fecha para ir a las tareas.</p><ul className="mt-2 divide-y divide-border">{upcomingByDate.map(([date, tasksForDate]) => <li key={date}><Link className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-primary" href={tasksForDate[0].href ?? `/gestion-procesos/cliente/tareas?tarea=${tasksForDate[0].id}#tarea-${tasksForDate[0].id}`}><time className="font-medium">{new Intl.DateTimeFormat("es-CO", { dateStyle: "full", timeZone: "America/Bogota" }).format(new Date(`${date}T12:00:00-05:00`))}</time><span className="shrink-0 text-sm text-(--foreground-muted)">{tasksForDate.length} tarea{tasksForDate.length === 1 ? "" : "s"} →</span></Link></li>)}</ul></section>}
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-semibold text-foreground">Pendientes contigo</h2>
                <p className="mt-0.5 text-xs text-(--foreground-muted)">
                  {openTasks.length} tarea(s) o subtarea(s) pendiente(s)
                </p>
              </div>
              <ListChecks className="size-5 text-primary" />
            </header>
            {openTasks.length ? (
              <ul className="divide-y divide-border">
                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    id={`tarea-${task.id}`}
                    className={`flex flex-wrap items-center justify-between gap-4 px-4 py-3 ${focusedTaskId === task.id ? "bg-primary/5" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {task.titulo}
                      </p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${isMainTaskAssignedToClient(task) ? "bg-primary/10 text-primary" : "bg-surface-muted text-(--foreground-muted)"}`}>
                        {isMainTaskAssignedToClient(task) ? "Tarea principal asignada a ti" : "Solo tienes asignada una subtarea; la tarea principal sigue a cargo del despacho"}
                      </span>
                      {task.descripcion && (
                        <p className="mt-1 text-sm text-(--foreground-muted)">
                          {task.descripcion}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-(--foreground-muted)">
                        {task.proceso_id ? <>Proceso: <a className="text-primary underline" href={`/gestion-procesos/cliente/procesos/${task.proceso_id}`}>{processNames.get(task.proceso_id) || "Ver proceso"}</a></> : "Tarea general del despacho"}
                        {isOverdue(task.fecha_limite) ? <span className="ml-2 font-semibold text-danger">Vencida</span> : task.fecha_limite ? <span className="ml-2 text-primary">Próxima</span> : null}
                      </p>
                      {task.subtareas.filter((subtask) => !subtask.completada)
                        .length > 0 && (
                        <ul className="mt-3 space-y-2 border-l-2 border-border pl-3">
                          {task.subtareas
                            .filter((subtask) => !subtask.completada)
                            .map((subtask) => (
                              <li
                                key={subtask.id}
                                className="flex flex-wrap items-center justify-between gap-2 text-sm"
                              >
                                <span className="min-w-0 text-foreground-secondary">
                                  {subtask.titulo}
                                  <span className="ml-2 text-xs text-(--foreground-muted)">
                                    {subtask.actuacion_id
                                      ? `Actuación #${subtask.actuacion_id}`
                                      : subtask.radicado_id
                                        ? `Radicado #${subtask.radicado_id}`
                                        : subtask.proceso_id
                                          ? `Proceso #${subtask.proceso_id}`
                                          : "General"}
                                  </span>
                                </span>
                                <button
                                  type="button"
                                  disabled={workingSubtaskId === subtask.id}
                                  onClick={() =>
                                    void completeSubtask(task.id, subtask.id)
                                  }
                                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"
                                >
                                  {workingSubtaskId === subtask.id
                                    ? "Guardando…"
                                    : "Completar subtarea"}
                                </button>
                              </li>
                            ))}
                        </ul>
                      )}
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-(--foreground-muted)">
                        <Clock3 className="size-3.5" />
                        {task.fecha_limite && !isMainTaskAssignedToClient(task) ? "Fecha limite de la tarea principal: " : null}
                        {task.fecha_limite
                          ? new Intl.DateTimeFormat("es-CO", {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: "America/Bogota",
                            }).format(new Date(task.fecha_limite))
                          : "Sin fecha límite"}{" "}
                        · {task.prioridad}
                      </p>
                      {canClientManageMainTask(task) ? <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-(--foreground-muted)">
                          Cambiar fecha y hora
                          <input aria-label={`Nueva fecha límite de ${task.titulo}`} type="datetime-local" value={deadlineDrafts[task.id] ?? fechaLocalParaInput(task.fecha_limite)} onChange={(event) => setDeadlineDrafts((current) => ({ ...current, [task.id]: event.target.value }))} className="rounded-md border border-border bg-surface-secondary px-2 py-1.5 text-xs text-foreground" />
                        </label>
                        <button type="button" disabled={deadlineBusyId === task.id} onClick={() => void updateDeadline(task)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-hover disabled:opacity-50"><CalendarClock className="size-3.5" />{deadlineBusyId === task.id ? "Reprogramando…" : "Guardar fecha"}</button>
                      </div> : <p className="mt-3 text-xs text-(--foreground-muted)">Puedes completar tu subtarea. Esta acción no cambia el estado de la tarea principal.</p>}
                    </div>
                    {canClientManageMainTask(task) && <button
                      type="button"
                      disabled={workingId === task.id}
                      onClick={() => void complete(task.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                    >
                      <Check className="size-4" />
                      {workingId === task.id ? "Guardando…" : "Completar"}
                    </button>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-(--foreground-muted)">
                No tienes tareas pendientes.
              </p>
            )}
          </section>
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><h2 className="font-semibold">Completadas</h2><p className="text-xs text-(--foreground-muted)">{completedTasks.length} tarea(s)</p></div><Check className="size-5 text-success"/></header>
            {completedTasks.length ? <ul className="divide-y divide-border">{completedTasks.map((task) => <li key={task.id} className="px-4 py-3"><p className="font-medium">{task.titulo}</p><p className="mt-1 text-xs text-(--foreground-muted)">{task.proceso_id ? processNames.get(task.proceso_id) || "Proceso relacionado" : "Tarea general"} · {isMainTaskAssignedToClient(task) ? "Tarea principal asignada a ti y completada" : "Tarea principal del despacho completada; tu subtarea tambien termino"}</p></li>)}</ul> : <p className="px-4 py-6 text-sm text-(--foreground-muted)">No has completado tareas asignadas.</p>}
          </section>
        </>
      )}
    </section>
  );
}
