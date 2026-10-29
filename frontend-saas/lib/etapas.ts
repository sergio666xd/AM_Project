import type { Esquemas } from "@/lib/api-v2/cliente";

export type PlantillaEtapas = Esquemas["PlantillaDeEtapas"];
export type EtapaDePlantilla = Esquemas["EtapaDePlantilla"];

/** Posición de la etapa actual en la línea del proceso; -1 si aún no tiene etapa. */
export function indiceEtapa(linea: readonly { id: number }[], actual: { id: number } | null | undefined): number {
  return actual ? linea.findIndex((e) => e.id === actual.id) : -1;
}
