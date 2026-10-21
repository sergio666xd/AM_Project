"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Clock,
  ListChecks,
  Mail,
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
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";

type EstadoTarea = "PENDIENTE" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";

type PrioridadTarea = "BAJA" | "MEDIA" | "ALTA" | "URGENTE";

type Subtarea = {
  id: number;
  tarea_id: number;
  titulo: string;
  completada: boolean;
  orden: number;
  completada_en?: string | null;
  proceso_id?: number | null;
  radicado_id?: number | null;
  actuacion_id?: number | null;
  asignada_cliente: boolean;
  cliente_id?: number | null;
  notificar_email: boolean;
  notificar_whatsapp: boolean;
};

type Recordatorio = {
  id: number;
  tarea_id: number;
  canal: "WHATSAPP";
  notificar_email: boolean;
  notificar_whatsapp: boolean;
  activo: boolean;
  fecha_hora?: string | null;
  anticipacion_minutos?: number | null;
  enviado_en?: string | null;
  workflow_pendiente_lanzamiento?: boolean;
};

type Tarea = {
  id: number;
  usuario_id: number;
  proceso_id?: number | null;
  radicado_id?: number | null;
  actuacion_id?: number | null;
  cliente_id?: number | null;
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
  actuaciones?: { id: number; actuacion?: string | null }[];
};
type ProcesoOption = {
  id: number;
  nombre: string;
  clientes?: { id: number; nombre_completo: string }[];
  radicados: {
    id: number;
    numero: string;
    actuaciones: { id: number; actuacion?: string | null }[];
  }[];
};
type ClienteOption = { id: number; nombre_completo: string; email: string };
type ScopeLevel = "HEREDAR" | "GENERAL" | "PROCESO" | "RADICADO" | "ACTUACION";

function formatDateTime(value?: string | null) {
  if (!value) return "Sin fecha";

  return new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota",
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

function RelationItem({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      {value && href ? <a href={href} className="mt-1 inline-flex items-center gap-1 font-semibold text-primary hover:underline">{value}<ExternalLink size={13} /></a> : <p className="mt-1 font-semibold text-foreground">{value || "Sin asociación"}</p>}
    </div>
  );
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

function getStatusLabel(status: EstadoTarea) {
  switch (status) {
    case "EN_CURSO":
      return "En curso";

    case "COMPLETADA":
      return "Completada";

    case "CANCELADA":
      return "Cancelada";

    default:
      return "Pendiente";
  }
}

function getPriorityLabel(priority: PrioridadTarea) {
  switch (priority) {
    case "URGENTE":
      return "Urgente";

    case "ALTA":
      return "Alta";

    case "MEDIA":
      return "Media";

    default:
      return "Baja";
  }
}

export default function TareaDetalleAbogadoPage() {
  const params = useParams();
  const router = useRouter();

  const tareaId = Number(params.id);

  const { token, loading: sessionLoading } = useSession();

  const [tarea, setTarea] = useState<Tarea | null>(null);
  const [radicados, setRadicados] = useState<Radicado[]>([]);
  const [procesos, setProcesos] = useState<ProcesoOption[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editingRelations, setEditingRelations] = useState(false);
  const [savingRelations, setSavingRelations] = useState(false);
  const [relationProcessId, setRelationProcessId] = useState("");
  const [relationRadicadoId, setRelationRadicadoId] = useState("");
  const [relationActuationId, setRelationActuationId] = useState("");
  const [relationClientId, setRelationClientId] = useState("");

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<EstadoTarea>("PENDIENTE");
  const [prioridad, setPrioridad] = useState<PrioridadTarea>("MEDIA");
  const [fechaLimite, setFechaLimite] = useState("");

  const [newSubtask, setNewSubtask] = useState("");
  const [editingSubtaskId, setEditingSubtaskId] = useState<number | null>(null);
  const [subtaskDraftTitle, setSubtaskDraftTitle] = useState("");
  const [subtaskDraftAssigned, setSubtaskDraftAssigned] = useState(false);
  const [subtaskDraftClientId, setSubtaskDraftClientId] = useState("");
  const [subtaskDraftEmail, setSubtaskDraftEmail] = useState(false);
  const [subtaskDraftWhatsapp, setSubtaskDraftWhatsapp] = useState(false);
  const [savingSubtask, setSavingSubtask] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskScope, setSubtaskScope] = useState<ScopeLevel>("HEREDAR");
  const [subtaskProcessId, setSubtaskProcessId] = useState("");
  const [subtaskRadicadoId, setSubtaskRadicadoId] = useState("");
  const [subtaskActuationId, setSubtaskActuationId] = useState("");
  const [subtaskAssignedToClient, setSubtaskAssignedToClient] = useState(false);
  const [subtaskClientId, setSubtaskClientId] = useState("");
  const [subtaskNotifyEmail, setSubtaskNotifyEmail] = useState(false);
  const [subtaskNotifyWhatsapp, setSubtaskNotifyWhatsapp] = useState(false);
  const [reminderNotifyEmail, setReminderNotifyEmail] = useState(false);
  const [reminderNotifyWhatsapp, setReminderNotifyWhatsapp] = useState(false);

  const [showReminderForm, setShowReminderForm] = useState(false);

  const [reminderMode, setReminderMode] = useState<"FECHA" | "ANTICIPACION">(
    "FECHA",
  );

  const [reminderDate, setReminderDate] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("60");

  const [savingReminder, setSavingReminder] = useState(false);

  const radicado = useMemo(() => {
    if (!tarea?.radicado_id) return null;

    return radicados.find((item) => item.id === tarea.radicado_id);
  }, [tarea, radicados]);

  const procesoAsociado = procesos.find((item) => item.id === tarea?.proceso_id);
  const clienteAsociado = clientes.find((item) => item.id === tarea?.cliente_id);
  const relationProcess = procesos.find((item) => item.id === Number(relationProcessId));
  const relationRadicadoOptions = relationProcessId
    ? relationProcess?.radicados ?? []
    : radicados.map((item) => ({
        id: item.id,
        numero: item.numero_radicado || item.numero || item.titulo || `Radicado #${item.id}`,
        actuaciones: item.actuaciones ?? [],
      }));
  const relationActuationOptions = relationRadicadoOptions.find(
    (item) => item.id === Number(relationRadicadoId),
  )?.actuaciones ?? [];
  const relationClientOptions = relationProcessId
    ? relationProcess?.clientes ?? []
    : clientes;
  const subtaskClientOptions = tarea?.proceso_id
    ? procesos.find((item) => item.id === tarea.proceso_id)?.clientes ?? []
    : clientes;

  const subtaskScopeOptions = useMemo(() => {
    const options: { value: ScopeLevel; label: string }[] = [
      { value: "HEREDAR", label: "Mismo ámbito que la tarea" },
    ];
    if (!tarea?.proceso_id && !tarea?.radicado_id && !tarea?.actuacion_id) {
      options.push(
        { value: "GENERAL", label: "General" },
        { value: "PROCESO", label: "Proceso" },
        { value: "RADICADO", label: "Radicado" },
        { value: "ACTUACION", label: "Actuación" },
      );
    } else if (tarea.proceso_id && !tarea.radicado_id && !tarea.actuacion_id) {
      options.push(
        { value: "PROCESO", label: "Proceso" },
        { value: "RADICADO", label: "Radicado del proceso" },
        { value: "ACTUACION", label: "Actuación del proceso" },
      );
    } else if (tarea.radicado_id && !tarea.actuacion_id) {
      options.push(
        { value: "RADICADO", label: "Radicado" },
        { value: "ACTUACION", label: "Actuación del radicado" },
      );
    } else if (tarea.actuacion_id) {
      options.push({ value: "ACTUACION", label: "Actuación" });
    }
    return options;
  }, [tarea]);

  const subtaskProcessOptions = useMemo(
    () =>
      procesos.filter((process) => {
        if (tarea?.proceso_id) return process.id === tarea.proceso_id;
        if (tarea?.radicado_id)
          return process.radicados.some(
            (item) => item.id === tarea.radicado_id,
          );
        return true;
      }),
    [procesos, tarea],
  );

  const subtaskRadicadoOptions = useMemo(() => {
    if (subtaskProcessId) {
      return (
        subtaskProcessOptions.find(
          (item) => item.id === Number(subtaskProcessId),
        )?.radicados ?? []
      );
    }
    if (tarea?.proceso_id) {
      return (
        subtaskProcessOptions.find((item) => item.id === tarea.proceso_id)
          ?.radicados ?? []
      );
    }
    if (tarea?.radicado_id)
      return radicados.filter((item) => item.id === tarea.radicado_id);
    return radicados;
  }, [subtaskProcessId, subtaskProcessOptions, radicados, tarea]);

  const subtaskActuationOptions =
    subtaskRadicadoOptions.find((item) => item.id === Number(subtaskRadicadoId))
      ?.actuaciones ?? [];

  async function loadData() {
    if (!token) return;

    try {
      setLoading(true);
      setError("");

      const [taskData, radicadosData, processData, clientData, userData] =
        await Promise.all([
          fetchApi(`/api/tareas/${tareaId}`, {
            method: "GET",
            token,
          }),

          fetchApi("/api/radicados", {
            method: "GET",
            token,
          }),
          fetchApi("/api/expedientes/procesos", { method: "GET", token }),
          fetchApi("/api/expedientes/clientes", { method: "GET", token }),
          fetchApi("/api/auth/me", { method: "GET", token }),
        ]);

      const preferencias = userData.preferencias_notificacion ?? {};
      const canalesSubtareas = preferencias.SUBTAREAS ?? {
        email: userData.notificaciones_email ?? true,
        whatsapp: userData.notificaciones_whatsapp ?? false,
      };
      const canalesRecordatorios = preferencias.RECORDATORIOS ?? {
        email: userData.notificaciones_email ?? true,
        whatsapp: userData.notificaciones_whatsapp ?? false,
      };
      setSubtaskNotifyEmail(Boolean(canalesSubtareas.email));
      setSubtaskNotifyWhatsapp(Boolean(canalesSubtareas.whatsapp));
      setReminderNotifyEmail(Boolean(canalesRecordatorios.email));
      setReminderNotifyWhatsapp(Boolean(canalesRecordatorios.whatsapp));

      setTarea(taskData);
      setRelationProcessId(taskData.proceso_id ? String(taskData.proceso_id) : "");
      setRelationRadicadoId(taskData.radicado_id ? String(taskData.radicado_id) : "");
      setRelationActuationId(taskData.actuacion_id ? String(taskData.actuacion_id) : "");
      setRelationClientId(taskData.cliente_id ? String(taskData.cliente_id) : "");

      setTitulo(taskData.titulo ?? "");
      setDescripcion(taskData.descripcion ?? "");
      setEstado(taskData.estado ?? "PENDIENTE");
      setPrioridad(taskData.prioridad ?? "MEDIA");

      setFechaLimite(toInputDateTime(taskData.fecha_limite));

      setRadicados(
        Array.isArray(radicadosData)
          ? radicadosData
          : (radicadosData.items ?? []),
      );
      setProcesos(Array.isArray(processData) ? processData : []);
      setClientes(Array.isArray(clientData) ? clientData : []);
      setSubtaskScope(
        taskData.proceso_id || taskData.radicado_id || taskData.actuacion_id
          ? "HEREDAR"
          : "GENERAL",
      );
      setSubtaskProcessId(
        taskData.proceso_id ? String(taskData.proceso_id) : "",
      );
      setSubtaskRadicadoId(
        taskData.radicado_id ? String(taskData.radicado_id) : "",
      );
      setSubtaskActuationId(
        taskData.actuacion_id ? String(taskData.actuacion_id) : "",
      );
      setSubtaskAssignedToClient(false);
      setSubtaskClientId("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo cargar la tarea.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionLoading || !tareaId || Number.isNaN(tareaId) || !token) {
      return;
    }

    loadData();
  }, [tareaId, token, sessionLoading]);

  async function toggleCompleted() {
    if (!tarea || !token) return;

    try {
      setError("");

      const updated = await fetchApi(`/api/tareas/${tarea.id}/completar`, {
        method: "PATCH",
        token,
      });

      setTarea(updated);
      setEstado(updated.estado);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo actualizar la tarea.",
      );
    }
  }

  async function saveTask() {
    if (!tarea || !token) return;

    try {
      setSaving(true);
      setError("");

      const updated = await fetchApi(`/api/tareas/${tarea.id}`, {
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
      });

      setTarea(updated);
      setTitulo(updated.titulo ?? "");
      setDescripcion(updated.descripcion ?? "");
      setEstado(updated.estado);
      setPrioridad(updated.prioridad);

      setFechaLimite(toInputDateTime(updated.fecha_limite));

      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  function startEditingRelations() {
    if (!tarea) return;
    setRelationProcessId(tarea.proceso_id ? String(tarea.proceso_id) : "");
    setRelationRadicadoId(tarea.radicado_id ? String(tarea.radicado_id) : "");
    setRelationActuationId(tarea.actuacion_id ? String(tarea.actuacion_id) : "");
    setRelationClientId(tarea.cliente_id ? String(tarea.cliente_id) : "");
    setEditingRelations(true);
  }

  async function saveRelations() {
    if (!tarea || !token) return;
    try {
      setSavingRelations(true);
      setError("");
      const updated = await fetchApi(`/api/tareas/${tarea.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          proceso_id: relationProcessId ? Number(relationProcessId) : null,
          radicado_id: relationRadicadoId ? Number(relationRadicadoId) : null,
          actuacion_id: relationActuationId ? Number(relationActuationId) : null,
          cliente_id: relationClientId ? Number(relationClientId) : null,
        }),
      });
      setTarea(updated);
      setRelationProcessId(updated.proceso_id ? String(updated.proceso_id) : "");
      setRelationRadicadoId(updated.radicado_id ? String(updated.radicado_id) : "");
      setRelationActuationId(updated.actuacion_id ? String(updated.actuacion_id) : "");
      setRelationClientId(updated.cliente_id ? String(updated.cliente_id) : "");
      setEditingRelations(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron actualizar las asociaciones.");
    } finally {
      setSavingRelations(false);
    }
  }

  function startEditingSubtask(subtask: Subtarea) {
    setEditingSubtaskId(subtask.id);
    setSubtaskDraftTitle(subtask.titulo);
    setSubtaskDraftAssigned(subtask.asignada_cliente);
    setSubtaskDraftClientId(subtask.cliente_id ? String(subtask.cliente_id) : "");
    setSubtaskDraftEmail(subtask.notificar_email);
    setSubtaskDraftWhatsapp(subtask.notificar_whatsapp);
  }

  async function saveSubtask(subtask: Subtarea) {
    if (!tarea || !token || !subtaskDraftTitle.trim()) return;
    try {
      setSavingSubtask(true);
      setError("");
      const updated = await fetchApi(`/api/tareas/${tarea.id}/subtareas/${subtask.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          titulo: subtaskDraftTitle.trim(),
          asignada_cliente: subtaskDraftAssigned,
          cliente_id: subtaskDraftAssigned && subtaskDraftClientId ? Number(subtaskDraftClientId) : null,
          notificar_email: subtaskDraftAssigned && subtaskDraftEmail,
          notificar_whatsapp: subtaskDraftAssigned && subtaskDraftWhatsapp,
        }),
      });
      setTarea((current) => current ? {
        ...current,
        subtareas: current.subtareas.map((item) => item.id === updated.id ? updated : item),
      } : current);
      setEditingSubtaskId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la subtarea.");
    } finally {
      setSavingSubtask(false);
    }
  }

  async function addSubtask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tarea || !token || !newSubtask.trim()) return;

    try {
      setAddingSubtask(true);
      setError("");

      const inferredProcessId = subtaskProcessId
        ? Number(subtaskProcessId)
        : subtaskRadicadoOptions.find(
              (item) => item.id === Number(subtaskRadicadoId),
            )
          ? (subtaskProcessOptions.find((process) =>
              process.radicados.some(
                (item) => item.id === Number(subtaskRadicadoId),
              ),
            )?.id ?? null)
          : null;
      const assignment =
        subtaskScope === "HEREDAR"
          ? {
              proceso_id: tarea.proceso_id ?? null,
              radicado_id: tarea.radicado_id ?? null,
              actuacion_id: tarea.actuacion_id ?? null,
            }
          : subtaskScope === "GENERAL"
            ? { proceso_id: null, radicado_id: null, actuacion_id: null }
            : subtaskScope === "PROCESO"
              ? {
                  proceso_id: Number(subtaskProcessId),
                  radicado_id: null,
                  actuacion_id: null,
                }
              : subtaskScope === "RADICADO"
                ? {
                    proceso_id: inferredProcessId,
                    radicado_id: Number(subtaskRadicadoId),
                    actuacion_id: null,
                  }
                : {
                    proceso_id: inferredProcessId,
                    radicado_id: Number(subtaskRadicadoId),
                    actuacion_id: Number(subtaskActuationId),
                  };
      const created = await fetchApi(`/api/tareas/${tarea.id}/subtareas`, {
        method: "POST",
        token,
        body: JSON.stringify({
          titulo: newSubtask.trim(),
          orden: tarea.subtareas.length,
          ...assignment,
          asignada_cliente: subtaskAssignedToClient,
          cliente_id: subtaskAssignedToClient ? Number(subtaskClientId) : null,
          notificar_email: subtaskNotifyEmail,
          notificar_whatsapp: subtaskNotifyWhatsapp,
        }),
      });

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: [...current.subtareas, created],
            }
          : current,
      );

      setNewSubtask("");
      setSubtaskAssignedToClient(false);
      setSubtaskClientId("");
      setSubtaskNotifyEmail(true);
      setSubtaskNotifyWhatsapp(true);
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear la subtarea.",
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
        },
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: current.subtareas.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la subtarea.",
      );
    }
  }

  async function deleteSubtask(id: number) {
    if (!tarea || !token) return;

    try {
      setError("");

      await fetchApi(`/api/tareas/${tarea.id}/subtareas/${id}`, {
        method: "DELETE",
        token,
      });

      setTarea((current) =>
        current
          ? {
              ...current,
              subtareas: current.subtareas.filter((item) => item.id !== id),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  async function createReminder() {
    if (!tarea || !token) return;

    if (!reminderNotifyEmail && !reminderNotifyWhatsapp) {
      setError("Selecciona al menos un canal de notificación.");
      return;
    }

    if (reminderMode === "FECHA" && !reminderDate) {
      setError("Selecciona la fecha y hora del recordatorio.");
      return;
    }

    if (reminderMode === "ANTICIPACION" && !reminderMinutes) {
      setError("Indica con cuántos minutos de anticipación.");
      return;
    }

    try {
      setSavingReminder(true);
      setError("");

      const body: Record<string, unknown> = {
        canal: "WHATSAPP",
        notificar_email: reminderNotifyEmail,
        notificar_whatsapp: reminderNotifyWhatsapp,
        activo: true,
      };

      if (reminderMode === "FECHA") {
        body.fecha_hora = new Date(reminderDate).toISOString();

        body.anticipacion_minutos = null;
      } else {
        body.fecha_hora = null;
        body.anticipacion_minutos = Number(reminderMinutes);
      }

      const created = await fetchApi(`/api/tareas/${tarea.id}/recordatorios`, {
        method: "POST",
        token,
        body: JSON.stringify(body),
      });
      if (created.workflow_pendiente_lanzamiento) {
        setError("Recordatorio guardado, pero el Workflow quedó pendiente de inicio. Se reintentará cuando el reconciliador esté disponible.");
      }

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios: [...current.recordatorios, created],
            }
          : current,
      );

      setReminderDate("");
      setReminderMinutes("60");
      setShowReminderForm(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo crear el recordatorio.",
      );
    } finally {
      setSavingReminder(false);
    }
  }

  async function toggleReminder(reminder: Recordatorio) {
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
        },
      );

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios: current.recordatorios.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el recordatorio.",
      );
    }
  }

  async function deleteReminder(id: number) {
    if (!tarea || !token) return;

    try {
      setError("");

      await fetchApi(`/api/tareas/${tarea.id}/recordatorios/${id}`, {
        method: "DELETE",
        token,
      });

      setTarea((current) =>
        current
          ? {
              ...current,
              recordatorios: current.recordatorios.filter(
                (item) => item.id !== id,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el recordatorio.",
      );
    }
  }

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-sm text-foreground-muted">Cargando tarea...</div>
      </div>
    );
  }

  if (!tarea) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push("/gestion-procesos/abogado/tareas")}
          className="flex items-center gap-2 text-sm text-foreground-secondary transition hover:text-foreground"
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

  const completedSubtasks = tarea.subtareas.filter(
    (item) => item.completada,
  ).length;

  const progress =
    tarea.subtareas.length > 0
      ? Math.round((completedSubtasks / tarea.subtareas.length) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/gestion-procesos/abogado/tareas")}
          icon={<ArrowLeft className="size-4" />}
        >
          Volver a tareas
        </Button>

        <div className="flex items-center gap-2">
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              icon={<Pencil className="size-4" />}
            >
              Editar
            </Button>
          )}

          <Button
            variant={tarea.estado === "COMPLETADA" ? "outline" : "primary"}
            size="sm"
            onClick={toggleCompleted}
            icon={<CheckCircle2 className="size-4" />}
          >
            {tarea.estado === "COMPLETADA"
              ? "Reabrir tarea"
              : "Marcar completada"}
          </Button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger-light px-4 py-3 text-sm text-danger">
          <span>{error}</span>

          <button
            onClick={() => setError("")}
            className="rounded p-1 transition hover:bg-black/5"
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
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-foreground">
                    Descripción
                  </label>

                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={5}
                    className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary"
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
                          setEstado(e.target.value as EstadoTarea)
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="PENDIENTE">Pendiente</option>

                        <option value="EN_CURSO">En curso</option>

                        <option value="COMPLETADA">Completada</option>

                        <option value="CANCELADA">Cancelada</option>
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
                          setPrioridad(e.target.value as PrioridadTarea)
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="BAJA">Baja</option>

                        <option value="MEDIA">Media</option>

                        <option value="ALTA">Alta</option>

                        <option value="URGENTE">Urgente</option>
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
                    onChange={(e) => setFechaLimite(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditing(false);
                      setTitulo(tarea.titulo);
                      setDescripcion(tarea.descripcion ?? "");
                      setEstado(tarea.estado);
                      setPrioridad(tarea.prioridad);
                      setFechaLimite(toInputDateTime(tarea.fecha_limite));
                    }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground-secondary transition hover:bg-surface-hover"
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={saveTask}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
                  >
                    <Save size={16} />

                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                      tarea.estado,
                    )}`}
                  >
                    {getStatusLabel(tarea.estado)}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPriorityClass(
                      tarea.prioridad,
                    )}`}
                  >
                    {getPriorityLabel(tarea.prioridad)}
                  </span>
                </div>

                <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
                  {tarea.titulo}
                </h1>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground-secondary">
                  {tarea.descripcion || "Esta tarea no tiene descripción."}
                </p>
              </>
            )}
          </section>

          {/* RELACIÓN */}
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-foreground">Relación</h2>
                <p className="mt-1 text-sm text-foreground-muted">Proceso, radicados y clientes asociados. Puedes cambiar o quitar cada asociación.</p>
              </div>
              {!editingRelations ? (
                <button type="button" onClick={startEditingRelations} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"><Pencil size={15} /> Editar relaciones</button>
              ) : (
                <button type="button" onClick={() => setEditingRelations(false)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-hover"><X size={15} /> Cancelar</button>
              )}
            </div>
            {editingRelations ? (
              <div className="space-y-4">
                <label className="block text-sm font-medium text-foreground">Proceso
                  <select value={relationProcessId} onChange={(event) => { setRelationProcessId(event.target.value); setRelationRadicadoId(""); setRelationActuationId(""); setRelationClientId(""); }} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal">
                    <option value="">Sin proceso</option>{procesos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-foreground">Radicado
                    <select value={relationRadicadoId} onChange={(event) => { setRelationRadicadoId(event.target.value); setRelationActuationId(""); }} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"><option value="">Sin radicado</option>{relationRadicadoOptions.map((item) => <option key={item.id} value={item.id}>{item.numero}</option>)}</select>
                  </label>
                  <label className="block text-sm font-medium text-foreground">Actuación
                    <select value={relationActuationId} onChange={(event) => setRelationActuationId(event.target.value)} disabled={!relationRadicadoId} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal disabled:opacity-60"><option value="">Sin actuación</option>{relationActuationOptions.map((item) => <option key={item.id} value={item.id}>{item.actuacion || `Actuación #${item.id}`}</option>)}</select>
                  </label>
                </div>
                <label className="block text-sm font-medium text-foreground">Cliente asignado a la tarea principal
                  <select value={relationClientId} onChange={(event) => setRelationClientId(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2.5 font-normal"><option value="">Sin cliente</option>{relationClientOptions.map((item) => <option key={item.id} value={item.id}>{item.nombre_completo}</option>)}</select>
                </label>
                <div className="flex justify-end"><button type="button" onClick={saveRelations} disabled={savingRelations} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"><Save size={15} />{savingRelations ? "Guardando…" : "Guardar relaciones"}</button></div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <RelationItem label="Proceso" value={procesoAsociado?.nombre} href={tarea.proceso_id ? `/gestion-procesos/abogado/procesos/${tarea.proceso_id}` : undefined} />
                <RelationItem label="Radicado" value={radicado?.numero_radicado || radicado?.numero || radicado?.titulo || (tarea.radicado_id ? `Radicado #${tarea.radicado_id}` : undefined)} href={tarea.radicado_id ? `/gestion-procesos/abogado/radicados/${tarea.radicado_id}` : undefined} />
                <RelationItem label="Actuación" value={tarea.actuacion_id ? (radicado?.actuaciones?.find((item) => item.id === tarea.actuacion_id)?.actuacion || `Actuación #${tarea.actuacion_id}`) : undefined} />
                <RelationItem label="Cliente asignado a la tarea principal" value={clienteAsociado?.nombre_completo} href={tarea.cliente_id ? `/gestion-procesos/abogado/clientes/${tarea.cliente_id}` : undefined} />
                {procesoAsociado && (procesoAsociado.radicados?.length ?? 0) > 0 && <div className="rounded-lg border border-border bg-surface-muted p-4 sm:col-span-2"><p className="text-xs font-medium text-foreground-muted">Radicados del proceso</p><div className="mt-2 flex flex-wrap gap-2">{procesoAsociado.radicados.map((item) => <a key={item.id} href={`/gestion-procesos/abogado/radicados/${item.id}`} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/20">{item.numero || `Radicado #${item.id}`}</a>)}</div></div>}
                {procesoAsociado && (procesoAsociado.clientes?.length ?? 0) > 0 && <div className="rounded-lg border border-border bg-surface-muted p-4 sm:col-span-2"><p className="text-xs font-medium text-foreground-muted">Clientes relacionados por el proceso (no asignados automáticamente a la tarea)</p><div className="mt-2 flex flex-wrap gap-2">{procesoAsociado.clientes?.map((item) => <a key={item.id} href={`/gestion-procesos/abogado/clientes/${item.id}`} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/20">{item.nombre_completo}</a>)}</div></div>}
              </div>
            )}
          </section>
          {/* SUBTAREAS */}
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <ListChecks size={19} className="text-primary" />

                <h2 className="font-semibold text-foreground">Subtareas</h2>
              </div>

              <p className="mt-1 text-sm text-foreground-muted">
                {completedSubtasks} de {tarea.subtareas.length} completadas
              </p>
            </div>

            <div className="space-y-2">
              {tarea.subtareas.map((subtask) => (
                <div key={subtask.id} className="rounded-lg border border-border px-3 py-3">
                  {editingSubtaskId === subtask.id ? (
                    <div className="space-y-3">
                      <input value={subtaskDraftTitle} onChange={(event) => setSubtaskDraftTitle(event.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm" aria-label="Título de subtarea" />
                      <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={subtaskDraftAssigned} onChange={(event) => { setSubtaskDraftAssigned(event.target.checked); if (!event.target.checked) setSubtaskDraftClientId(""); }} />Asignar solo esta subtarea a un cliente</label>
                      <p className="text-xs text-foreground-muted">La asignacion de esta subtarea no asigna la tarea principal al cliente.</p>
                      {subtaskDraftAssigned && <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm text-foreground">Cliente<select value={subtaskDraftClientId} onChange={(event) => setSubtaskDraftClientId(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"><option value="">Seleccionar cliente</option>{subtaskClientOptions.map((client) => <option key={client.id} value={client.id}>{client.nombre_completo}</option>)}</select></label>
                        <div className="flex flex-wrap gap-4 self-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subtaskDraftEmail} onChange={(event) => setSubtaskDraftEmail(event.target.checked)} />Correo</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={subtaskDraftWhatsapp} onChange={(event) => setSubtaskDraftWhatsapp(event.target.checked)} />WhatsApp</label></div>
                      </div>}
                      <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingSubtaskId(null)} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancelar</button><button type="button" disabled={savingSubtask || !subtaskDraftTitle.trim() || (subtaskDraftAssigned && !subtaskDraftClientId)} onClick={() => void saveSubtask(subtask)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{savingSubtask ? "Guardando…" : "Guardar"}</button></div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleSubtask(subtask)} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${subtask.completada ? "border-success bg-success !text-white" : "border-border-strong hover:border-primary"}`}>{subtask.completada && <Check size={13} />}</button>
                      <div className="min-w-0 flex-1"><p className={`text-sm ${subtask.completada ? "text-foreground-muted line-through" : "text-foreground"}`}>{subtask.titulo}</p>{subtask.asignada_cliente && <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Solo esta subtarea · {subtask.cliente_id ? clientes.find((client) => client.id === subtask.cliente_id)?.nombre_completo ?? "Cliente" : "Cliente asignado"}</span>}</div>
                      <button type="button" onClick={() => startEditingSubtask(subtask)} aria-label="Editar subtarea" className="rounded p-1.5 text-foreground-muted transition hover:bg-surface-hover hover:text-primary"><Pencil size={15} /></button>
                      <button type="button" onClick={() => { if (window.confirm("¿Eliminar esta subtarea?")) void deleteSubtask(subtask.id); }} aria-label="Eliminar subtarea" className="rounded p-1.5 text-foreground-muted transition hover:bg-danger-light hover:text-danger"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
              ))}
              {tarea.subtareas.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-foreground-muted">
                  No hay subtareas.
                </div>
              )}
            </div>

            <form
              onSubmit={addSubtask}
              className="mt-5 space-y-3 rounded-lg border border-border bg-surface-muted p-4"
            >
              <label className="block text-sm font-medium text-foreground">
                Título de subtarea
                <input
                  required
                  value={newSubtask}
                  onChange={(event) => setNewSubtask(event.target.value)}
                  placeholder="Describe el paso pendiente"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium text-foreground">
                  Ámbito de la subtarea
                  <select
                    value={subtaskScope}
                    onChange={(event) => {
                      const next = event.target.value as ScopeLevel;
                      setSubtaskScope(next);
                      setSubtaskProcessId(
                        next === "PROCESO" && tarea.proceso_id
                          ? String(tarea.proceso_id)
                          : "",
                      );
                      setSubtaskRadicadoId(
                        next === "RADICADO" && tarea.radicado_id
                          ? String(tarea.radicado_id)
                          : "",
                      );
                      setSubtaskActuationId(
                        next === "ACTUACION" && tarea.actuacion_id
                          ? String(tarea.actuacion_id)
                          : "",
                      );
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal"
                  >
                    {subtaskScopeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {subtaskScope === "PROCESO" && (
                  <label className="block text-sm font-medium text-foreground">
                    Proceso
                    <select
                      required
                      value={subtaskProcessId}
                      onChange={(event) =>
                        setSubtaskProcessId(event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal"
                    >
                      <option value="">Seleccionar proceso</option>
                      {subtaskProcessOptions.map((process) => (
                        <option key={process.id} value={process.id}>
                          {process.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(subtaskScope === "RADICADO" ||
                  subtaskScope === "ACTUACION") && (
                  <label className="block text-sm font-medium text-foreground">
                    Radicado
                    <select
                      required
                      value={subtaskRadicadoId}
                      onChange={(event) => {
                        setSubtaskRadicadoId(event.target.value);
                        setSubtaskActuationId("");
                      }}
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal"
                    >
                      <option value="">Seleccionar radicado</option>
                      {subtaskRadicadoOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.numero}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {subtaskScope === "ACTUACION" && (
                  <label className="block text-sm font-medium text-foreground">
                    Actuación
                    <select
                      required
                      value={subtaskActuationId}
                      onChange={(event) =>
                        setSubtaskActuationId(event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal"
                    >
                      <option value="">Seleccionar actuación</option>
                      {subtaskActuationOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.actuacion || `Actuación #${item.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={subtaskAssignedToClient}
                  onChange={(event) => {
                    setSubtaskAssignedToClient(event.target.checked);
                    if (!event.target.checked) setSubtaskClientId("");
                    else if (tarea.cliente_id)
                      setSubtaskClientId(String(tarea.cliente_id));
                  }}
                />
                Asignar solo esta subtarea a un cliente
              </label>
              <p className="text-xs text-foreground-muted">La asignacion de esta subtarea no asigna la tarea principal al cliente.</p>
              {subtaskAssignedToClient && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-foreground">
                    Cliente
                    <select
                      required
                      value={subtaskClientId}
                      onChange={(event) =>
                        setSubtaskClientId(event.target.value)
                      }
                      className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-normal disabled:opacity-70"
                    >
                      <option value="">Seleccionar cliente</option>
                      {subtaskClientOptions.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.nombre_completo}
                          </option>
                        ))}
                    </select>
                  </label>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-foreground">
                      Notificar al cliente
                    </legend>
                    <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                      <input
                        type="checkbox"
                        checked={subtaskNotifyEmail}
                        onChange={(event) =>
                          setSubtaskNotifyEmail(event.target.checked)
                        }
                      />
                      <Mail className="size-4" />
                      Correo electrónico
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                      <input
                        type="checkbox"
                        checked={subtaskNotifyWhatsapp}
                        onChange={(event) =>
                          setSubtaskNotifyWhatsapp(event.target.checked)
                        }
                      />
                      <MessageCircle className="size-4" />
                      WhatsApp
                    </label>
                  </fieldset>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={
                    addingSubtask ||
                    !newSubtask.trim() ||
                    (subtaskScope === "PROCESO" && !subtaskProcessId) ||
                    ((subtaskScope === "RADICADO" ||
                      subtaskScope === "ACTUACION") &&
                      !subtaskRadicadoId) ||
                    (subtaskScope === "ACTUACION" && !subtaskActuationId) ||
                    (subtaskAssignedToClient && !subtaskClientId)
                  }
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Plus size={17} />
                  {addingSubtask ? "Guardando…" : "Agregar subtarea"}
                </button>
              </div>
            </form>
          </section>

          {/* NOTIFICACIONES */}
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Bell size={19} className="text-primary" />

                  <h2 className="font-semibold text-foreground">
                    Notificaciones
                  </h2>
                </div>

                <p className="mt-1 text-sm text-foreground-muted">
                  Configura recordatorios para esta tarea.
                </p>
              </div>

              <button
                onClick={() => setShowReminderForm(!showReminderForm)}
                className="flex w-fit items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-hover"
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
                <fieldset className="mb-4 flex flex-wrap gap-x-6 gap-y-2">
                  <legend className="mb-2 text-sm font-semibold text-foreground">Canales de notificación</legend>
                  <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <input type="checkbox" checked={reminderNotifyEmail} onChange={(event) => setReminderNotifyEmail(event.target.checked)} />
                    <Mail className="size-4" /> Correo electrónico
                  </label>
                  <label className="flex items-center gap-2 text-sm text-foreground-secondary">
                    <input type="checkbox" checked={reminderNotifyWhatsapp} onChange={(event) => setReminderNotifyWhatsapp(event.target.checked)} />
                    <MessageCircle className="size-4" /> WhatsApp
                  </label>
                </fieldset>

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
                            e.target.value as "FECHA" | "ANTICIPACION",
                          )
                        }
                        className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="FECHA">Fecha y hora específica</option>

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
                        onChange={(e) => setReminderDate(e.target.value)}
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
                          onChange={(e) => setReminderMinutes(e.target.value)}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 pr-20 text-sm text-foreground outline-none focus:border-primary"
                        />

                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-foreground-muted">
                          minutos
                        </span>
                      </div>

                      {!tarea.fecha_limite && (
                        <p className="mt-2 text-xs text-warning">
                          Esta opción requiere una fecha límite en la tarea.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={createReminder}
                    disabled={savingReminder}
                    className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-50"
                  >
                    {savingReminder ? "Guardando…" : "Crear recordatorio"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {tarea.recordatorios.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {reminder.notificar_email && <Mail size={17} />}
                    {reminder.notificar_whatsapp && <MessageCircle size={17} />}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {[
                        reminder.notificar_email && "Correo",
                        reminder.notificar_whatsapp && "WhatsApp",
                      ].filter(Boolean).join(" y ")}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                      {reminder.fecha_hora ? (
                        <>
                          <Clock size={13} />

                          <span>{formatDateTime(reminder.fecha_hora)}</span>
                        </>
                      ) : reminder.anticipacion_minutos ? (
                        <>
                          <Clock size={13} />

                          <span>
                            {reminder.anticipacion_minutos === 60
                              ? "1 hora antes"
                              : `${reminder.anticipacion_minutos} minutos antes`}
                          </span>
                        </>
                      ) : (
                        <span>Sin programación</span>
                      )}
                    </div>

                    {reminder.enviado_en && (
                      <p className="mt-1 text-xs text-success">
                        Enviado el {formatDateTime(reminder.enviado_en)}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleReminder(reminder)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        reminder.activo
                          ? "bg-success-light text-success"
                          : "bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {reminder.activo ? "Activo" : "Inactivo"}
                    </button>

                    <button
                      onClick={() => deleteReminder(reminder.id)}
                      className="rounded-lg p-2 text-foreground-muted transition hover:bg-danger-light hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              {tarea.recordatorios.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <Bell size={24} className="mx-auto text-foreground-muted" />

                  <p className="mt-2 text-sm font-medium text-foreground">
                    No hay recordatorios configurados.
                  </p>

                  <p className="mt-1 text-xs text-foreground-muted">
                    Puedes agregar una notificación por WhatsApp.
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
            <h2 className="mb-4 font-semibold text-foreground">Información</h2>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Calendar size={17} className="mt-0.5 text-foreground-muted" />

                <div>
                  <p className="text-xs text-foreground-muted">Fecha límite</p>

                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDateTime(tarea.fecha_limite)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock size={17} className="mt-0.5 text-foreground-muted" />

                <div>
                  <p className="text-xs text-foreground-muted">Creada</p>

                  <p className="mt-1 text-sm font-medium text-foreground">
                    {formatDateTime(tarea.created_at)}
                  </p>
                </div>
              </div>

              {tarea.completada_en && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={17} className="mt-0.5 text-success" />

                  <div>
                    <p className="text-xs text-foreground-muted">Completada</p>

                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatDateTime(tarea.completada_en)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* PROGRESO */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Progreso</h2>

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
              {completedSubtasks} de {tarea.subtareas.length} subtareas
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
                tarea.estado,
              )}`}
            >
              {getStatusLabel(tarea.estado)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
