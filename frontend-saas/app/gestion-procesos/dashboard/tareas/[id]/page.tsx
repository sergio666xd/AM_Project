"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  ListChecks,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { useSession } from "@/context/SessionContext";

type EstadoTarea =
  | "PENDIENTE"
  | "EN_CURSO"
  | "COMPLETADA"
  | "CANCELADA";

type PrioridadTarea = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

type Subtarea = {
  id: number;
  tarea_id: number;
  titulo: string;
  completada: boolean;
  orden: number;
  completada_en?: string | null;
};

type Recordatorio = {
  id: number;
  tarea_id: number;
  canal: "WHATSAPP";
  activo: boolean;
  fecha_hora?: string | null;
  anticipacion_minutos?: number | null;
  enviado_en?: string | null;
};

type Tarea = {
  id: number;
  usuario_id: number;
  radicado_id?: number | null;
  actuacion_id?: number | null;
  titulo: string;
  descripcion?: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea;
  fecha_limite?: string | null;
  completada_en?: string | null;
  created_at: string;
  updated_at: string;
  subtareas: Subtarea[];
  recordatorios: Recordatorio[];
};

type Radicado = {
  id: number;
  numero_radicado?: string;
  numero?: string;
  titulo?: string;
  asunto?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";

  return new Date(value).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha";

  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toInputDateTime(value?: string | null) {
  if (!value) return "";

  const date = new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getPriorityClass(priority: PrioridadTarea) {
  switch (priority) {
    case "URGENTE":
      return "bg-danger-light text-danger";
    case "ALTA":
      return "bg-warning-light text-warning";
    case "MEDIA":
      return "bg-primary-light text-primary";
    case "BAJA":
      return "bg-surface-muted text-foreground-secondary";
  }
}

function getStatusClass(status: EstadoTarea) {
  switch (status) {
    case "COMPLETADA":
      return "bg-success-light text-success";
    case "CANCELADA":
      return "bg-danger-light text-danger";
    case "EN_CURSO":
      return "bg-primary-light text-primary";
    default:
      return "bg-warning-light text-warning";
  }
}

export default function TareaDetallePage() {
  const params = useParams();
  const router = useRouter();

  const tareaId = Number(params.id);

  const { token, loading: sessionLoading } = useSession();

  const [tarea, setTarea] = useState<Tarea | null>(null);
  const [radicados, setRadicados] = useState<Radicado[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] =
    useState<EstadoTarea>("PENDIENTE");
  const [prioridad, setPrioridad] =
    useState<PrioridadTarea>("MEDIA");
  const [fechaLimite, setFechaLimite] = useState("");

  const [newSubtask, setNewSubtask] = useState("");
  const [addingSubtask, setAddingSubtask] = useState(false);

  const [showReminderForm, setShowReminderForm] =
    useState(false);

  const [reminderMode, setReminderMode] =
    useState<"FECHA" | "ANTICIPACION">("FECHA");

  const [reminderDate, setReminderDate] = useState("");
  const [reminderMinutes, setReminderMinutes] =
    useState("60");

  const [savingReminder, setSavingReminder] =
    useState(false);

  const radicado = useMemo(() => {
    if (!tarea?.radicado_id) return null;

    return radicados.find(
      (item) => item.id === tarea.radicado_id
    );
  }, [tarea, radicados]);

  async function loadData() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const [taskData, radicadosData] = await Promise.all([
        fetchApi(`/api/tareas/${tareaId}`, {
          method: "GET",
          token,
        }),
        fetchApi("/api/radicados", {
          method: "GET",
          token,
        }),
      ]);

      setTarea(taskData);

      setTitulo(taskData.titulo ?? "");
      setDescripcion(taskData.descripcion ?? "");
      setEstado(taskData.estado ?? "PENDIENTE");
      setPrioridad(taskData.prioridad ?? "MEDIA");

      setFechaLimite(
        toInputDateTime(taskData.fecha_limite)
      );

      setRadicados(
        Array.isArray(radicadosData)
          ? radicadosData
          : radicadosData.items ?? []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la tarea."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (
      sessionLoading ||
      !tareaId ||
      Number.isNaN(tareaId) ||
      !token
    ) {
      return;
    }

    loadData();
  }, [tareaId, token, sessionLoading]);

  async function toggleCompleted() {
    if (!tarea || !token) return;

    try {
      setError("");

      const updated = await fetchApi(
        `/api/tareas/${tarea.id}/completar`,
        {
          method: "PATCH",
          token,
        }
      );

      setTarea(updated);
      setEstado(updated.estado);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la tarea."
      );
    }
  }

  async function saveTask() {
    if (!tarea || !token) return;

    try {
      setSaving(true);
      setError("");

      const updated = await fetchApi(
        `/api/tareas/${tarea.id}`,
        {
          method: "PUT",
          token,
          body: JSON.stringify({
            titulo,
            descripcion: descripcion || null,
            estado,
            prioridad,
            fecha_limite: fechaLimite
              ? new Date(fechaLimite).toISOString()
              : null,
          }),
        }
      );

      setTarea(updated);
      setTitulo(updated.titulo ?? "");
      setDescripcion(updated.descripcion ?? "");
      setEstado(updated.estado);
      setPrioridad(updated.prioridad);
      setFechaLimite(
        toInputDateTime(updated.fecha_limite)
      );

      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask() {
    if (!tarea || !token || !newSubtask.trim()) return;

    try {
      setAddingSubtask(true);
      setError("");

      const created = await fetchApi(
        `/api/tareas/${tarea.id}/subtareas`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            titulo: newSubtask.trim(),
            orden: tarea.subtareas.length,
          }),
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: [
                ...current.subtareas,
                created,
              ],
            }
          : current
      );

      setNewSubtask("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear la subtarea."
      );
    } finally {
      setAddingSubtask(false);
    }
  }

  async function toggleSubtask(subtask: Subtarea) {
    if (!tarea || !token) return;

    try {
      setError("");

      const updated = await fetchApi(
        `/api/tareas/${tarea.id}/subtareas/${subtask.id}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            completada: !subtask.completada,
          }),
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: current.subtareas.map(
                (item) =>
                  item.id === updated.id
                    ? updated
                    : item
              ),
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la subtarea."
      );
    }
  }

  async function deleteSubtask(id: number) {
    if (!tarea || !token) return;

    try {
      setError("");

      await fetchApi(
        `/api/tareas/${tarea.id}/subtareas/${id}`,
        {
          method: "DELETE",
          token,
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: current.subtareas.filter(
                (item) => item.id !== id
              ),
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar."
      );
    }
  }

  async function createReminder() {
    if (!tarea || !token) return;

    if (
      reminderMode === "FECHA" &&
      !reminderDate
    ) {
      setError(
        "Selecciona la fecha y hora del recordatorio."
      );
      return;
    }

    if (
      reminderMode === "ANTICIPACION" &&
      !reminderMinutes
    ) {
      setError(
        "Indica con cuántos minutos de anticipación."
      );
      return;
    }

    try {
      setSavingReminder(true);
      setError("");

      const body: Record<string, unknown> = {
        canal: "WHATSAPP",
        activo: true,
      };

      if (reminderMode === "FECHA") {
        body.fecha_hora = new Date(
          reminderDate
        ).toISOString();

        body.anticipacion_minutos = null;
      } else {
        body.fecha_hora = null;

        body.anticipacion_minutos =
          Number(reminderMinutes);
      }

      const created = await fetchApi(
        `/api/tareas/${tarea.id}/recordatorios`,
        {
          method: "POST",
          token,
          body: JSON.stringify(body),
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios: [
                ...current.recordatorios,
                created,
              ],
            }
          : current
      );

      setReminderDate("");
      setReminderMinutes("60");
      setShowReminderForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el recordatorio."
      );
    } finally {
      setSavingReminder(false);
    }
  }

  async function toggleReminder(
    reminder: Recordatorio
  ) {
    if (!tarea || !token) return;

    try {
      setError("");

      const updated = await fetchApi(
        `/api/tareas/${tarea.id}/recordatorios/${reminder.id}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            activo: !reminder.activo,
          }),
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios:
                current.recordatorios.map(
                  (item) =>
                    item.id === updated.id
                      ? updated
                      : item
                ),
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el recordatorio."
      );
    }
  }

  async function deleteReminder(id: number) {
    if (!tarea || !token) return;

    try {
      setError("");

      await fetchApi(
        `/api/tareas/${tarea.id}/recordatorios/${id}`,
        {
          method: "DELETE",
          token,
        }
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios:
                current.recordatorios.filter(
                  (item) => item.id !== id
                ),
            }
          : current
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar."
      );
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-foreground-muted">
          Cargando tarea...
        </div>
      </div>
    );
  }

  if (!tarea) {
    return (
      <div className="space-y-4">
        <button
          onClick={() =>
            router.push("/dashboard/tareas")
          }
          className="flex items-center gap-2 text-sm text-foreground-secondary hover:text-foreground"
        >
          <ArrowLeft size={18} />
          Volver a tareas
        </button>

        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-foreground">
            {error || "No se encontró la tarea."}
          </p>
        </div>
      </div>
    );
  }

  const completedSubtasks =
    tarea.subtareas.filter(
      (item) => item.completada
    ).length;

  const progress =
    tarea.subtareas.length > 0
      ? Math.round(
          (completedSubtasks /
            tarea.subtareas.length) *
            100
        )
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* HEADER */}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button
          onClick={() =>
            router.push("/dashboard/tareas")
          }
          className="flex w-fit items-center gap-2 text-sm font-medium text-foreground-secondary transition hover:text-foreground"
        >
          <ArrowLeft size={18} />
          Volver a tareas
        </button>

        <div className="flex items-center gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-hover"
            >
              <Pencil size={16} />
              Editar
            </button>
          )}

          <button
            onClick={toggleCompleted}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tarea.estado === "COMPLETADA"
                ? "border border-border bg-surface text-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary-hover"
            }`}
          >
            <CheckCircle2 size={17} />

            {tarea.estado === "COMPLETADA"
              ? "Reabrir tarea"
              : "Marcar completada"}
          </button>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger">
          <span>{error}</span>

          <button
            onClick={() => setError("")}
            className="rounded p-1 hover:bg-black/5"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* MAIN */}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* LEFT */}

        <div className="space-y-6">
          {/* DETALLE */}

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            {editing ? (
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Título
                  </label>

                  <input
                    value={titulo}
                    onChange={(e) =>
                      setTitulo(e.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Descripción
                  </label>

                  <textarea
                    value={descripcion}
                    onChange={(e) =>
                      setDescripcion(e.target.value)
                    }
                    rows={5}
                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Estado
                    </label>

                    <div className="relative">
                      <select
                        value={estado}
                        onChange={(e) =>
                          setEstado(
                            e.target
                              .value as EstadoTarea
                          )
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="PENDIENTE">
                          Pendiente
                        </option>

                        <option value="EN_CURSO">
                          En curso
                        </option>

                        <option value="COMPLETADA">
                          Completada
                        </option>

                        <option value="CANCELADA">
                          Cancelada
                        </option>
                      </select>

                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Prioridad
                    </label>

                    <div className="relative">
                      <select
                        value={prioridad}
                        onChange={(e) =>
                          setPrioridad(
                            e.target
                              .value as PrioridadTarea
                          )
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="BAJA">
                          Baja
                        </option>

                        <option value="MEDIA">
                          Media
                        </option>

                        <option value="ALTA">
                          Alta
                        </option>

                        <option value="URGENTE">
                          Urgente
                        </option>
                      </select>

                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Fecha límite
                  </label>

                  <input
                    type="datetime-local"
                    value={fechaLimite}
                    onChange={(e) =>
                      setFechaLimite(e.target.value)
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setTitulo(tarea.titulo);
                      setDescripcion(
                        tarea.descripcion ?? ""
                      );
                      setEstado(tarea.estado);
                      setPrioridad(tarea.prioridad);
                      setFechaLimite(
                        toInputDateTime(
                          tarea.fecha_limite
                        )
                      );
                    }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-hover"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={saveTask}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                  >
                    <Save size={16} />

                    {saving
                      ? "Guardando..."
                      : "Guardar cambios"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                      tarea.estado
                    )}`}
                  >
                    {tarea.estado === "EN_CURSO"
                      ? "En curso"
                      : tarea.estado === "COMPLETADA"
                      ? "Completada"
                      : tarea.estado === "CANCELADA"
                      ? "Cancelada"
                      : "Pendiente"}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPriorityClass(
                      tarea.prioridad
                    )}`}
                  >
                    {tarea.prioridad}
                  </span>
                </div>

                <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                  {tarea.titulo}
                </h1>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground-secondary">
                  {tarea.descripcion ||
                    "Esta tarea no tiene descripción."}
                </p>
              </>
            )}
          </section>

          {/* RELACIÓN */}

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="font-semibold text-foreground">
                Relación
              </h2>

              <p className="mt-1 text-sm text-foreground-muted">
                Elementos asociados a esta tarea.
              </p>
            </div>

            {tarea.radicado_id ? (
              <a
                href={`/dashboard/radicados/${tarea.radicado_id}`}
                className="group flex items-center justify-between rounded-lg border border-border bg-surface-muted p-4 transition hover:border-primary hover:bg-primary-light"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                    <ExternalLink size={18} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground-muted">
                      Radicado
                    </p>

                    <p className="truncate font-semibold text-foreground group-hover:text-primary">
                      {radicado?.numero_radicado ||
                        radicado?.numero ||
                        `Radicado #${tarea.radicado_id}`}
                    </p>

                    {radicado?.titulo && (
                      <p className="mt-0.5 truncate text-xs text-foreground-muted">
                        {radicado.titulo}
                      </p>
                    )}

                    {radicado?.asunto && (
                      <p className="mt-0.5 truncate text-xs text-foreground-muted">
                        {radicado.asunto}
                      </p>
                    )}
                  </div>
                </div>

                <span className="ml-3 shrink-0 text-sm font-medium text-primary">
                  Ver
                </span>
              </a>
            ) : (
              <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
                Tarea general, sin radicado asociado.
              </div>
            )}

            {tarea.actuacion_id && (
              <div className="mt-3 rounded-lg border border-border bg-surface-muted p-4">
                <p className="text-xs font-medium text-foreground-muted">
                  Actuación
                </p>

                <p className="mt-1 font-semibold text-foreground">
                  Actuación #{tarea.actuacion_id}
                </p>
              </div>
            )}
          </section>

          {/* SUBTAREAS */}

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ListChecks
                    size={19}
                    className="text-primary"
                  />

                  <h2 className="font-semibold text-foreground">
                    Subtareas
                  </h2>
                </div>

                <p className="mt-1 text-sm text-foreground-muted">
                  {completedSubtasks} de{" "}
                  {tarea.subtareas.length} completadas
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {tarea.subtareas.map((subtask) => (
                <div
                  key={subtask.id}
                  className="group flex items-center gap-3 rounded-lg border border-border px-3 py-3"
                >
                  <button
                    onClick={() =>
                      toggleSubtask(subtask)
                    }
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                      subtask.completada
                        ? "border-success bg-success text-white"
                        : "border-border-strong hover:border-primary"
                    }`}
                  >
                    {subtask.completada && (
                      <Check size={13} />
                    )}
                  </button>

                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      subtask.completada
                        ? "text-foreground-muted line-through"
                        : "text-foreground"
                    }`}
                  >
                    {subtask.titulo}
                  </span>

                  <button
                    onClick={() =>
                      deleteSubtask(subtask.id)
                    }
                    className="rounded p-1.5 text-foreground-muted opacity-0 transition hover:bg-danger-light hover:text-danger group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}

              {tarea.subtareas.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-foreground-muted">
                  No hay subtareas.
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <input
                value={newSubtask}
                onChange={(e) =>
                  setNewSubtask(e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addSubtask();
                  }
                }}
                placeholder="Agregar una subtarea..."
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground-muted focus:border-primary"
              />

              <button
                onClick={addSubtask}
                disabled={
                  addingSubtask ||
                  !newSubtask.trim()
                }
                className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              >
                <Plus size={17} />

                <span className="hidden sm:inline">
                  Agregar
                </span>
              </button>
            </div>
          </section>

          {/* NOTIFICACIONES */}

          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bell
                    size={19}
                    className="text-primary"
                  />

                  <h2 className="font-semibold text-foreground">
                    Notificaciones
                  </h2>
                </div>

                <p className="mt-1 text-sm text-foreground-muted">
                  Configura recordatorios para esta tarea.
                </p>
              </div>

              <button
                onClick={() =>
                  setShowReminderForm(
                    !showReminderForm
                  )
                }
                className="flex w-fit items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"
              >
                {showReminderForm ? (
                  <>
                    <X size={16} />
                    Cancelar
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Nuevo recordatorio
                  </>
                )}
              </button>
            </div>

            {/* NUEVO RECORDATORIO */}

            {showReminderForm && (
              <div className="mt-5 rounded-lg border border-border bg-surface-muted p-4">
                <div className="mb-4 flex items-center gap-2">
                  <MessageCircle
                    size={18}
                    className="text-success"
                  />

                  <span className="text-sm font-semibold text-foreground">
                    WhatsApp
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Tipo de recordatorio
                    </label>

                    <div className="relative">
                      <select
                        value={reminderMode}
                        onChange={(e) =>
                          setReminderMode(
                            e.target.value as
                              | "FECHA"
                              | "ANTICIPACION"
                          )
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="FECHA">
                          Fecha y hora específica
                        </option>

                        <option value="ANTICIPACION">
                          Antes de la fecha límite
                        </option>
                      </select>

                      <ChevronDown
                        size={16}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-foreground-muted"
                      />
                    </div>
                  </div>

                  {reminderMode === "FECHA" ? (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Fecha y hora
                      </label>

                      <input
                        type="datetime-local"
                        value={reminderDate}
                        onChange={(e) =>
                          setReminderDate(
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        Anticipación
                      </label>

                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          value={reminderMinutes}
                          onChange={(e) =>
                            setReminderMinutes(
                              e.target.value
                            )
                          }
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-20 text-sm text-foreground outline-none focus:border-primary"
                        />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground-muted">
                          minutos
                        </span>
                      </div>

                      {!tarea.fecha_limite && (
                        <p className="mt-2 text-xs text-warning">
                          Esta opción requiere una fecha
                          límite en la tarea.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={createReminder}
                    disabled={
                      savingReminder ||
                      (reminderMode ===
                        "ANTICIPACION" &&
                        !tarea.fecha_limite)
                    }
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    <Bell size={16} />

                    {savingReminder
                      ? "Guardando..."
                      : "Crear recordatorio"}
                  </button>
                </div>
              </div>
            )}

            {/* LISTADO */}

            <div className="mt-5 space-y-3">
              {tarea.recordatorios.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-light text-success">
                      <MessageCircle size={17} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        WhatsApp
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                        {reminder.fecha_hora ? (
                          <>
                            <Clock size={13} />

                            <span>
                              {formatDateTime(
                                reminder.fecha_hora
                              )}
                            </span>
                          </>
                        ) : reminder.anticipacion_minutos ? (
                          <>
                            <Clock size={13} />

                            <span>
                              {reminder.anticipacion_minutos ===
                              60
                                ? "1 hora antes"
                                : `${reminder.anticipacion_minutos} minutos antes`}
                            </span>
                          </>
                        ) : (
                          <span>
                            Sin programación
                          </span>
                        )}
                      </div>

                      {reminder.enviado_en && (
                        <p className="mt-1 text-xs text-success">
                          Enviado el{" "}
                          {formatDateTime(
                            reminder.enviado_en
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        toggleReminder(reminder)
                      }
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        reminder.activo
                          ? "bg-success-light text-success"
                          : "bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {reminder.activo
                        ? "Activo"
                        : "Inactivo"}
                    </button>

                    <button
                      onClick={() =>
                        deleteReminder(reminder.id)
                      }
                      className="rounded-lg p-2 text-foreground-muted transition hover:bg-danger-light hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {tarea.recordatorios.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Bell
                    size={24}
                    className="mx-auto text-foreground-muted"
                  />

                  <p className="mt-2 text-sm font-medium text-foreground">
                    No hay recordatorios configurados.
                  </p>

                  <p className="mt-1 text-xs text-foreground-muted">
                    Puedes agregar una notificación por
                    WhatsApp.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* RIGHT */}

        <aside className="space-y-6">
          {/* INFORMACIÓN */}

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-foreground">
              Información
            </h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar
                  size={17}
                  className="mt-0.5 text-foreground-muted"
                />

                <div>
                  <p className="text-xs text-foreground-muted">
                    Fecha límite
                  </p>

                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDateTime(
                      tarea.fecha_limite
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock
                  size={17}
                  className="mt-0.5 text-foreground-muted"
                />

                <div>
                  <p className="text-xs text-foreground-muted">
                    Creada
                  </p>

                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDateTime(
                      tarea.created_at
                    )}
                  </p>
                </div>
              </div>

              {tarea.completada_en && (
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    size={17}
                    className="mt-0.5 text-success"
                  />

                  <div>
                    <p className="text-xs text-foreground-muted">
                      Completada
                    </p>

                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatDateTime(
                        tarea.completada_en
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* PROGRESO */}

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">
                Progreso
              </h2>

              <span className="text-sm font-semibold text-primary">
                {progress}%
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

            <p className="mt-2 text-xs text-foreground-muted">
              {completedSubtasks} de{" "}
              {tarea.subtareas.length} subtareas
              completadas
            </p>
          </section>

          {/* ESTADO */}

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-foreground">
              Estado actual
            </h2>

            <div
              className={`rounded-lg px-4 py-3 text-center text-sm font-semibold ${getStatusClass(
                tarea.estado
              )}`}
            >
              {tarea.estado === "EN_CURSO"
                ? "En curso"
                : tarea.estado === "COMPLETADA"
                ? "Completada"
                : tarea.estado === "CANCELADA"
                ? "Cancelada"
                : "Pendiente"}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}