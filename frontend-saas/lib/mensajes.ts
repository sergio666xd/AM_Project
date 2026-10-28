import type { Esquemas } from "@/lib/api-v2/cliente";

export type Conversacion = Esquemas["Conversacion"];
export type MensajeChat = Esquemas["Mensaje"];
export type Entrega = Esquemas["Entrega"];
export type OpcionReferencia = Esquemas["OpcionReferencia"];

export const RUTA_MENSAJES = "/gestion-procesos/abogado/chat";

/** Lo que sigue a /chat en la ruta, sea la interna o la corta de los subdominios (/chat/12/34). */
export function partesDeRuta(pathname: string): string[] {
  const segmentos = pathname.split("/").filter(Boolean);
  const indice = segmentos.indexOf("chat");
  return indice < 0 ? [] : segmentos.slice(indice + 1);
}

/**
 * La clave de la conversación a partir de la ruta. Son las mismas rutas del chat
 * anterior, así siguen sirviendo los enlaces de los avisos y de las notificaciones:
 * /chat/12/34 (proceso 12 con la persona 34), /chat/12/colaboradores,
 * /chat/directo/5 y /chat/administrador.
 */
export function claveDeRuta(partes: string[]): string | null {
  if (partes.length === 2 && partes[0] === "directo") return `direct:${partes[1]}`;
  if (partes.length === 1 && !/^\d+$/.test(partes[0])) return `direct:${partes[0]}`;
  if (partes.length >= 2 && /^\d+$/.test(partes[0])) {
    return partes[1] === "colaboradores" ? `process:${partes[0]}:collaborators` : `process:${partes[0]}:${partes[1]}`;
  }
  return null;
}

/** /chat/12 lleva a la lista filtrada por ese proceso. */
export function procesoDeRuta(partes: string[]): number | null {
  return partes.length === 1 && /^\d+$/.test(partes[0]) ? Number(partes[0]) : null;
}

export function rutaDe(conversacion: Pick<Conversacion, "clave">): string {
  const [tipo, a, b] = conversacion.clave.split(":");
  if (tipo === "direct") return `${RUTA_MENSAJES}/directo/${a}`;
  return `${RUTA_MENSAJES}/${a}/${b === "collaborators" ? "colaboradores" : b}`;
}

/** Una línea legible del mensaje, sin las marcas de formato. */
export function vistaPrevia(texto: string): string {
  return texto
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((linea) => linea.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").replace(/^\s*\d+[.)]\s+/, ""))
    .join(" ")
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2")
    .replace(/([*_])([^*_\n]+)\1/g, "$2")
    .trim();
}

export function textoEntrega(entrega: Entrega): string {
  const varios = entrega.destinatarios > 1;
  if (entrega.estado === "leido") return varios ? `Leído por ${entrega.leidos}` : "Leído";
  if (entrega.estado === "entregado" || entrega.estado === "entregado_parcial") return varios ? `Entregado a ${entrega.entregados} de ${entrega.destinatarios}` : "Entregado";
  return "Enviado";
}

export const TIPO_REFERENCIA: Record<OpcionReferencia["tipo"], string> = {
  RADICADO: "Radicado",
  ACTUACION: "Actuación",
  TAREA: "Tarea",
  SUBTAREA: "Subtarea",
  EVENTO: "Evento",
  DOCUMENTO: "Documento",
};

/** Las referencias guardadas llevan prefijos como «Tarea - …»; en pantalla sobra. */
export function tituloReferencia(titulo: string): string {
  return titulo.replace(/^(Tarea|Subtarea|Evento) - /, "");
}
