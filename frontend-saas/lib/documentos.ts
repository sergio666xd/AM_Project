import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";
import { diaCorto } from "@/lib/fechas";

export type Archivo = Esquemas["Archivo"];
export type Version = Esquemas["Version"];
export type Solicitud = Esquemas["Solicitud"];
export type Pedido = Esquemas["Pedido"];
export type EstadoRevision = Archivo["estado_revision"];

const ESTADOS: Record<Pedido["estado"], { nombre: string; tono: TonoTag }> = {
  FALTANTE: { nombre: "Falta", tono: "neutral" },
  RECIBIDO: { nombre: "Por revisar", tono: "gold" },
  EN_REVISION: { nombre: "Por revisar", tono: "gold" },
  APROBADO: { nombre: "Aprobado", tono: "ok" },
  REQUIERE_CORRECCION: { nombre: "Por corregir", tono: "bad" },
  RECHAZADO: { nombre: "Rechazado", tono: "bad" },
};

export function estadoDocumento(estado: Pedido["estado"]) {
  return ESTADOS[estado] ?? ESTADOS.RECIBIDO;
}

export function porRevisar(estado: EstadoRevision): boolean {
  return estado === "RECIBIDO" || estado === "EN_REVISION";
}

export const ESTADO_SOLICITUD: Record<Solicitud["estado"], { nombre: string; tono: TonoTag }> = {
  esperando_cliente: { nombre: "Esperando al cliente", tono: "neutral" },
  por_revisar: { nombre: "Por revisar", tono: "gold" },
  completa: { nombre: "Completa", tono: "ok" },
};

function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Cómo va la fecha límite de una solicitud, contada en días de Bogotá. */
export function plazo(solicitud: Pick<Solicitud, "fecha_limite" | "estado">, hoy: string): { texto: string; tono: TonoTag } | null {
  if (!solicitud.fecha_limite) return null;
  if (solicitud.estado !== "esperando_cliente") return { texto: `Pedido para el ${diaCorto(solicitud.fecha_limite)}`, tono: "neutral" };
  const dias = diasEntre(hoy, solicitud.fecha_limite);
  if (dias < -1) return { texto: `Venció hace ${-dias} días`, tono: "bad" };
  if (dias === -1) return { texto: "Venció ayer", tono: "bad" };
  if (dias === 0) return { texto: "Vence hoy", tono: "warn" };
  if (dias === 1) return { texto: "Vence mañana", tono: "warn" };
  if (dias <= 3) return { texto: `Vence en ${dias} días`, tono: "warn" };
  return { texto: `Vence el ${diaCorto(solicitud.fecha_limite)}`, tono: "neutral" };
}

/** "PDF", "Imagen" o "Word" para el tipo del archivo. */
export function tipoDeArchivo(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return "Imagen";
  if (mime.includes("wordprocessingml")) return "Word";
  return "Archivo";
}

export const RUTA_DOCUMENTOS = "/gestion-procesos/abogado/documentos";

/** El archivo de una versión, desde la API v2 (con la cookie de sesión). */
export async function obtenerArchivo(id: number): Promise<Blob> {
  const respuesta = await fetch(`/api/v2/documentos/${id}/archivo?descargar=false`, { credentials: "same-origin" });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => null);
    throw new Error(cuerpo?.mensaje ?? "No se pudo abrir el archivo.");
  }
  return respuesta.blob();
}

/** Descarga una versión con su nombre original. */
export async function descargarArchivo(version: Pick<Version, "id" | "nombre_archivo">): Promise<void> {
  const blob = await obtenerArchivo(version.id);
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = version.nombre_archivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
