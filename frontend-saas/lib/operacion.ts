import type { TonoTag } from "@/components/ui/Tag";
import type { Esquemas } from "@/lib/api-v2/cliente";
import { fechaLarga } from "@/lib/fechas";

export type Ejecucion = Esquemas["Ejecucion"];
export type Envio = Esquemas["Envio"];

export const ESTADO_EJECUCION: Record<Ejecucion["estado"], { nombre: string; tono: TonoTag }> = {
  en_cola: { nombre: "En cola", tono: "neutral" },
  en_proceso: { nombre: "Consultando", tono: "navy" },
  completada: { nombre: "Completa", tono: "ok" },
  con_errores: { nombre: "Con errores", tono: "warn" },
  fallida: { nombre: "Falló", tono: "bad" },
};

export const ESTADO_RESULTADO: Record<Esquemas["ResultadoRadicado"]["estado"], { nombre: string; tono: TonoTag }> = {
  consultado: { nombre: "Consultado", tono: "ok" },
  con_error: { nombre: "Con error", tono: "bad" },
  pendiente: { nombre: "Pendiente", tono: "neutral" },
};

export const ESTADO_ENVIO: Record<Envio["estado"], { nombre: string; tono: TonoTag }> = {
  pendiente: { nombre: "En cola", tono: "neutral" },
  enviando: { nombre: "Enviando", tono: "navy" },
  enviado: { nombre: "Enviado", tono: "ok" },
  fallido: { nombre: "Falló, se reintentará", tono: "warn" },
  agotado: { nombre: "No se pudo enviar", tono: "bad" },
  omitido: { nombre: "No se envió", tono: "neutral" },
};

export const CANAL_ENVIO: Record<NonNullable<Envio["canal"]>, string> = {
  EMAIL: "Correo",
  WHATSAPP: "WhatsApp",
  PUSH: "Navegador",
};

export const DIAS_SEMANA = [
  { valor: 0, corto: "L", nombre: "Lunes" },
  { valor: 1, corto: "M", nombre: "Martes" },
  { valor: 2, corto: "X", nombre: "Miércoles" },
  { valor: 3, corto: "J", nombre: "Jueves" },
  { valor: 4, corto: "V", nombre: "Viernes" },
  { valor: 5, corto: "S", nombre: "Sábado" },
  { valor: 6, corto: "D", nombre: "Domingo" },
];

/** "12:00" → "12:00 m.", "17:00" → "5:00 p. m." */
export function horaColombia(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === 12 && !m) return "12:00 m.";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "a. m." : "p. m."}`;
}

/** "viernes 30 de octubre, 12:00 m." */
export function momentoColombia(iso: string): string {
  const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(iso));
  return `${fechaLarga(iso)}, ${horaColombia(hhmm)}`;
}

/** Inicia una consulta a la Rama Judicial con el launcher de Workflows. */
export async function lanzarConsulta(radicadoIds?: number[]): Promise<string | null> {
  const seleccion = Boolean(radicadoIds?.length);
  try {
    const respuesta = await fetch(seleccion ? "/workflow-admin/consultas/radicado" : "/workflow-admin/consultas", {
      method: "POST",
      headers: { "X-AM-Solicitud": "1", ...(seleccion ? { "Content-Type": "application/json" } : {}) },
      ...(seleccion ? { body: JSON.stringify({ tipo: "MANUAL", radicado_ids: radicadoIds }) } : {}),
    });
    if (respuesta.ok) return null;
    const datos = (await respuesta.json().catch(() => ({}))) as { detail?: string };
    return datos.detail || "No fue posible iniciar la consulta.";
  } catch {
    return "No fue posible iniciar la consulta. Revise su conexión.";
  }
}
