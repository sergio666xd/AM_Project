"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, ListChecks, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import TaskMonthCalendar, {
  type CalendarTask,
} from "@/components/calendar/TaskMonthCalendar";

type Task = CalendarTask & {
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

async function loadTasks(token: string): Promise<Task[]> {
  return fetchApi("/api/tareas", { method: "GET", token });
}

export default function TareasClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<number | null>(null);
  const [workingSubtaskId, setWorkingSubtaskId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (sessionLoading || !token) return;
    let active = true;
    loadTasks(token)
      .then((result) => {
        if (active) setTasks(result);
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

  const openTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (task.estado !== "COMPLETADA" && task.estado !== "CANCELADA") ||
          task.subtareas.some((subtask) => !subtask.completada),
      ),
    [tasks],
  );
  const calendarTasks: CalendarTask[] = tasks
    .filter((task) => task.fecha_limite)
    .map((task) => ({
      id: task.id,
      titulo: task.titulo,
      estado: task.estado,
      prioridad: task.prioridad,
      fecha_limite: task.fecha_limite,
      href: undefined,
    }));

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-(--foreground-muted)">
            Portal del cliente
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Mis tareas
          </h1>
          <p className="mt-1 text-sm text-(--foreground-muted)">
            Revisa vencimientos y marca como completadas las tareas asignadas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || sessionLoading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      {loading || sessionLoading ? (
        <div className="grid min-h-48 place-items-center gap-3 text-sm text-(--foreground-muted)">
          <RefreshCw className="size-5 animate-spin" />
          Cargando tareas...
        </div>
      ) : (
        <>
          <TaskMonthCalendar tasks={calendarTasks} />
          <section className="overflow-hidden rounded-lg border border-border bg-surface">
            <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-semibold text-foreground">Pendientes</h2>
                <p className="mt-0.5 text-xs text-(--foreground-muted)">
                  {openTasks.length} tarea(s) por completar
                </p>
              </div>
              <ListChecks className="size-5 text-primary" />
            </header>
            {openTasks.length ? (
              <ul className="divide-y divide-border">
                {openTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {task.titulo}
                      </p>
                      {task.descripcion && (
                        <p className="mt-1 text-sm text-(--foreground-muted)">
                          {task.descripcion}
                        </p>
                      )}
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
                        {task.fecha_limite
                          ? new Intl.DateTimeFormat("es-CO", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(task.fecha_limite))
                          : "Sin fecha límite"}{" "}
                        · {task.prioridad}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={workingId === task.id}
                      onClick={() => void complete(task.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
                    >
                      <Check className="size-4" />
                      {workingId === task.id ? "Guardando…" : "Completar"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-(--foreground-muted)">
                No tienes tareas pendientes.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
