import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";

export type InicioCliente = Esquemas["InicioCliente"];
export type ResumenProcesoCliente = Esquemas["ResumenProcesoCliente"];
export type ProcesoCliente = Esquemas["ProcesoCliente"];
export type EntradaHistoria = Esquemas["EntradaHistoria"];
export type Pendiente = Esquemas["PendienteCliente"];
export type DocumentoCliente = Esquemas["DocumentoCliente"];

export const RUTA_CLIENTE = "/gestion-procesos/cliente";

export function rutaProceso(id: number, ancla?: string): string {
  return `${RUTA_CLIENTE}/procesos/${id}${ancla ? `#${ancla}` : ""}`;
}

/** La conversación del cliente con quien lleva su caso, en ese proceso. */
export function rutaMensajeAbogado(proceso: Pick<ResumenProcesoCliente, "id" | "abogado">): string {
  return `${RUTA_CLIENTE}/chat/${proceso.id}/${proceso.abogado.id}`;
}

/** A dónde lleva cada pendiente mientras la página de Pendientes vive en la API v1. */
export function rutaPendiente(pendiente: Pendiente): string {
  const [tipo, id] = pendiente.clave.split(":");
  if (tipo === "solicitud") return `${RUTA_CLIENTE}/documentos#solicitud-${id}`;
  if (tipo === "tarea") return `${RUTA_CLIENTE}/tareas?tarea=${id}#tarea-${id}`;
  return `${RUTA_CLIENTE}/tareas`;
}

export function saludo(ahora = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(ahora));
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
}

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/** «una cosa», «3 cosas». */
export function cuantasCosas(n: number): string {
  return n === 1 ? "una cosa" : `${n} cosas`;
}

const TONO_ESTADO: Record<string, TonoTag> = {
  pendiente: "gold",
  "por corregir": "bad",
  "no aceptado": "bad",
  aprobado: "ok",
  entregado: "ok",
  hecha: "ok",
  "en revisión": "neutral",
  recibido: "neutral",
  "en curso": "navy",
  cancelada: "neutral",
};

export function tonoEstado(estado: string): TonoTag {
  return TONO_ESTADO[estado] ?? "neutral";
}

export function textoEstado(estado: string): string {
  return estado.charAt(0).toUpperCase() + estado.slice(1);
}

export const ORIGEN_DOCUMENTO: Record<DocumentoCliente["origen"], string> = {
  cliente: "Usted lo envió",
  firma: "Lo compartió la firma",
  contrato: "Contrato firmado",
};
