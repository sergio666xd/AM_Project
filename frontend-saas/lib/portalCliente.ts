import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";

export type InicioCliente = Esquemas["InicioCliente"];
export type ResumenProcesoCliente = Esquemas["ResumenProcesoCliente"];
export type ProcesoCliente = Esquemas["ProcesoCliente"];
export type EntradaHistoria = Esquemas["EntradaHistoria"];
export type Pendiente = Esquemas["PendienteCliente"];
export type DocumentoCliente = Esquemas["DocumentoCliente"];
export type PendientesCliente = Esquemas["PendientesCliente"];
export type DetallePendiente = Esquemas["DetallePendiente"];
export type PedidoDocumento = Esquemas["PedidoDocumento"];
export type HechoReciente = Esquemas["HechoReciente"];

export const RUTA_CLIENTE = "/gestion-procesos/cliente";

export function rutaProceso(id: number, ancla?: string): string {
  return `${RUTA_CLIENTE}/procesos/${id}${ancla ? `#${ancla}` : ""}`;
}

/** La conversación del cliente con quien lleva su caso, en ese proceso. */
export function rutaMensajeAbogado(proceso: Pick<ResumenProcesoCliente, "id" | "abogado">): string {
  return `${RUTA_CLIENTE}/chat/${proceso.id}/${proceso.abogado.id}`;
}

export const RUTA_PENDIENTES = `${RUTA_CLIENTE}/pendientes`;

/** «solicitud:3» → «solicitud-3», el ancla de su tarjeta en Pendientes. */
export function anclaPendiente(clave: string): string {
  return clave.replace(":", "-");
}

export function rutaPendiente(pendiente: Pick<Pendiente, "clave">): string {
  return `${RUTA_PENDIENTES}#${anclaPendiente(pendiente.clave)}`;
}

/** Lo que el portal acepta subir, igual que la API. */
export const TIPOS_ARCHIVO = ".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;

export function tamanoLegible(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
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
