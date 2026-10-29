import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";

export type Cliente = Esquemas["ClienteResumen"];
export type FichaCliente = Esquemas["ClienteFicha"];
export type GrupoClientes = "todos" | "con_pendientes" | "sin_ingreso" | "sin_procesos";

export const RUTA_CLIENTES = "/gestion-procesos/abogado/clientes";

export const ACCESO: Record<Cliente["acceso"], { nombre: string; tono: TonoTag }> = {
  activo: { nombre: "Entra al portal", tono: "ok" },
  sin_ingreso: { nombre: "No ha entrado", tono: "warn" },
  suspendido: { nombre: "Suspendido", tono: "bad" },
};

export const CANAL: Record<"EMAIL" | "WHATSAPP", string> = { EMAIL: "Correo", WHATSAPP: "WhatsApp" };

/** La conversación con el cliente en Mensajes, si el usuario puede escribirle. */
export function enlaceChat(cliente: Pick<Cliente, "id" | "proceso_chat_id">): string | null {
  return cliente.proceso_chat_id ? `/gestion-procesos/abogado/chat/${cliente.proceso_chat_id}/${cliente.id}` : null;
}

/** Número para enlaces de WhatsApp; los celulares colombianos sin indicativo lo reciben. */
export function whatsappDigitos(valor?: string | null): string {
  const digitos = (valor || "").replace(/\D/g, "");
  return digitos.length === 10 && digitos.startsWith("3") ? `57${digitos}` : digitos;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function textoPendientes(cliente: Pick<Cliente, "documentos_pendientes" | "solicitudes_vencidas">): { texto: string; tono: TonoTag } | null {
  const n = cliente.documentos_pendientes;
  if (!n) return null;
  return { texto: n === 1 ? "Falta 1 documento" : `Faltan ${n} documentos`, tono: cliente.solicitudes_vencidas ? "bad" : "gold" };
}
