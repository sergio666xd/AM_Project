import type { StatusTone } from "@/components/ui/Badge";

/** Etiquetas y tonos compartidos para que todos los paneles hablen igual. */
type Label = { label: string; tone: StatusTone };

const TIME_ZONE = "America/Bogota";

const taskStatus: Record<string, Label> = {
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  EN_CURSO: { label: "En curso", tone: "normal" },
  COMPLETADA: { label: "Completada", tone: "completed" },
  CANCELADA: { label: "Cancelada", tone: "archived" },
};

const priority: Record<string, Label & { rank: number }> = {
  BAJA: { label: "Baja", tone: "archived", rank: 1 },
  MEDIA: { label: "Media", tone: "review", rank: 2 },
  ALTA: { label: "Alta", tone: "attention", rank: 3 },
  URGENTE: { label: "Urgente", tone: "risk", rank: 4 },
};

const reviewStatus: Record<string, Label> = {
  RECIBIDO: { label: "Por revisar", tone: "pending" },
  EN_REVISION: { label: "En revisión", tone: "review" },
  APROBADO: { label: "Aprobado", tone: "completed" },
  REQUIERE_CORRECCION: { label: "Requiere corrección", tone: "risk" },
  RECHAZADO: { label: "Rechazado", tone: "rejected" },
  FALTANTE: { label: "Faltante", tone: "attention" },
};

const health: Record<string, Label & { rank: number }> = {
  RIESGO: { label: "En riesgo", tone: "risk", rank: 4 },
  ATENCION: { label: "Requiere atención", tone: "attention", rank: 3 },
  NORMAL: { label: "Al día", tone: "completed", rank: 2 },
  ARCHIVADO: { label: "Archivado", tone: "archived", rank: 1 },
};

const roles: Record<string, string> = {
  ADMIN: "Administrador",
  ABOGADO_ADMIN: "Abogado de la firma",
  ABOGADO: "Abogado asociado",
  CLIENTE: "Cliente",
};

const userStatus: Record<string, Label> = {
  ACTIVO: { label: "Activo", tone: "completed" },
  PENDIENTE: { label: "Pendiente", tone: "pending" },
  SUSPENDIDO: { label: "Suspendido", tone: "attention" },
  RECHAZADO: { label: "Rechazado", tone: "rejected" },
};

function humanize(value: string) {
  const text = value.replaceAll("_", " ").toLocaleLowerCase("es");
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}

function lookup(map: Record<string, Label>, value?: string | null): Label {
  if (!value) return { label: "—", tone: "archived" };
  return map[value] ?? { label: humanize(value), tone: "normal" };
}

export const taskStatusLabel = (value?: string | null) => lookup(taskStatus, value);
export const priorityLabel = (value?: string | null) => lookup(priority, value);
export const priorityRank = (value?: string | null) => (value ? priority[value]?.rank ?? 0 : 0);
export const reviewStatusLabel = (value?: string | null) => lookup(reviewStatus, value);
export const healthLabel = (value?: string | null) => lookup(health, value);
export const healthRank = (value?: string | null) => (value ? health[value]?.rank ?? 0 : 0);
export const roleLabel = (value?: string | null) => (value ? roles[value] ?? humanize(value) : "—");
export const userStatusLabel = (value?: string | null) => lookup(userStatus, value);

/** Estado de la última consulta a la Rama Judicial. */
export function consultaLabel(value?: string | null): Label {
  const normalized = (value || "").toLocaleLowerCase("es");
  if (!normalized || normalized === "sin consultar") return { label: "Sin consultar", tone: "archived" };
  if (normalized === "ok") return { label: "Consultado", tone: "completed" };
  if (normalized.includes("no_encontrado") || normalized.includes("no encontrado")) return { label: "No encontrado", tone: "attention" };
  if (normalized.includes("privado")) return { label: "Proceso privado", tone: "review" };
  if (normalized.includes("error")) return { label: "Error de consulta", tone: "risk" };
  if (normalized.includes("pendiente") || normalized.includes("consultando")) return { label: "Consultando", tone: "pending" };
  return { label: humanize(value || ""), tone: "normal" };
}

export function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value?: string | Date | null) {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE }).format(date) : "—";
}

export function formatDateTime(value?: string | Date | null) {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TIME_ZONE }).format(date)
    : "—";
}

const relativeFormatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** "hace 3 días", "en 2 horas"… para fechas cercanas; fecha completa si no. */
export function formatRelative(value?: string | Date | null, now = Date.now()) {
  const date = toDate(value);
  if (!date) return "—";
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return "justo ahora";
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86400 * 30) return relativeFormatter.format(Math.round(diffSeconds / 86400), "day");
  return formatDate(date);
}

export function isOverdue(dueDate?: string | null, status?: string | null, now = Date.now()) {
  const date = toDate(dueDate);
  return Boolean(date && date.getTime() < now && status !== "COMPLETADA" && status !== "CANCELADA");
}

/** Valor para un campo `datetime-local` (hora local del navegador) a partir de una fecha UTC. */
export function toDateTimeLocalInput(value?: string | Date | null) {
  const date = toDate(value);
  if (!date) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
