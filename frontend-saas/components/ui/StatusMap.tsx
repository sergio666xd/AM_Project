/**
 * Maps backend enum values to human-friendly labels and semantic tones.
 * Centralised here so every page uses consistent labels.
 */

import type { StatusTone } from "./Badge";

type StatusMap = { label: string; tone: StatusTone };

/* ── Process states ── */
const processStatuses: Record<string, StatusMap> = {
  ACTIVO: { label: "Activo", tone: "normal" },
  EN_PROCESO: { label: "En curso", tone: "normal" },
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  ARCHIVADO: { label: "Archivado", tone: "archived" },
  CERRADO: { label: "Cerrado", tone: "archived" },
  TERMINADO: { label: "Terminado", tone: "completed" },
};

/* ── Task states ── */
const taskStatuses: Record<string, StatusMap> = {
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  EN_PROGRESO: { label: "En progreso", tone: "normal" },
  COMPLETADA: { label: "Completada", tone: "completed" },
  CANCELADA: { label: "Cancelada", tone: "archived" },
  VENCIDA: { label: "Vencida", tone: "overdue" },
};

/* ── User states ── */
const userStatuses: Record<string, StatusMap> = {
  ACTIVO: { label: "Activo", tone: "completed" },
  PENDIENTE_APROBACION: { label: "Pendiente", tone: "pending" },
  SUSPENDIDO: { label: "Suspendido", tone: "risk" },
  RECHAZADO: { label: "Rechazado", tone: "rejected" },
};

/* ── Document request states ── */
const documentStatuses: Record<string, StatusMap> = {
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  ENTREGADO: { label: "Entregado", tone: "completed" },
  APROBADO: { label: "Aprobado", tone: "completed" },
  RECHAZADO: { label: "Rechazado", tone: "rejected" },
  VENCIDO: { label: "Vencido", tone: "overdue" },
};

/* ── Notification delivery states ── */
const deliveryStatuses: Record<string, StatusMap> = {
  ENVIADO: { label: "Enviado", tone: "completed" },
  FALLIDO: { label: "Fallido", tone: "risk" },
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  LEIDO: { label: "Leído", tone: "completed" },
};

const allMaps: Record<string, Record<string, StatusMap>> = {
  process: processStatuses,
  task: taskStatuses,
  user: userStatuses,
  document: documentStatuses,
  delivery: deliveryStatuses,
};

/**
 * Resolve a backend status enum to a label and badge tone.
 *
 * ```tsx
 * const { label, tone } = resolveStatus("task", task.estado);
 * <Badge tone={tone}>{label}</Badge>
 * ```
 */
export function resolveStatus(
  domain: keyof typeof allMaps,
  value: string | null | undefined,
): StatusMap {
  if (!value) return { label: "—", tone: "archived" };
  const map = allMaps[domain];
  if (map && map[value]) return map[value];
  // Fallback: title-case the raw value
  return {
    label: value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " "),
    tone: "normal",
  };
}

