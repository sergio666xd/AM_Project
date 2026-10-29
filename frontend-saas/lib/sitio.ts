import type { Esquemas } from "@/lib/api-v2/cliente";

export type MensajeSitio = Esquemas["MensajeSitio"];
export type AreaConsulta = MensajeSitio["area"];
export type EstadoMensajeSitio = MensajeSitio["estado"];

/** Lo que la persona eligió en el formulario, como lo lee la firma. */
export const AREA_CONSULTA: Record<AreaConsulta, string> = {
  familia: "Familia o herencias",
  empresas: "Empresas o contratos",
  propiedad_horizontal: "Propiedad horizontal",
  publico: "Entidad pública",
  poliza: "Póliza jurídica",
  otro: "Otro asunto",
};

export const ESTADO_MENSAJE: Record<EstadoMensajeSitio, { nombre: string; tono: "gold" | "ok" | "neutral" }> = {
  nueva: { nombre: "Sin atender", tono: "gold" },
  atendida: { nombre: "Atendido", tono: "ok" },
  descartada: { nombre: "Descartado", tono: "neutral" },
};

/** "3152223344" → "315 222 3344"; deja igual lo que no reconoce. */
export function telefonoLegible(valor: string) {
  const digitos = valor.replace(/\D/g, "");
  const local = digitos.length === 12 && digitos.startsWith("57") ? digitos.slice(2) : digitos;
  return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : valor;
}
