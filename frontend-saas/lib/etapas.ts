import type { Esquemas } from "@/lib/api-v2/cliente";

export type Etapa = NonNullable<Esquemas["ProcesoResumen"]["etapa"]>;

export const ETAPAS: { id: Etapa; nombre: string }[] = [
  { id: "demanda", nombre: "Demanda" },
  { id: "admision", nombre: "Admisión" },
  { id: "pruebas", nombre: "Pruebas" },
  { id: "audiencia", nombre: "Audiencia" },
  { id: "sentencia", nombre: "Sentencia" },
];

export function nombreEtapa(etapa: string | null | undefined): string {
  return ETAPAS.find((e) => e.id === etapa)?.nombre ?? "Sin etapa";
}

/** Posición de la etapa en la línea; -1 si el proceso aún no tiene etapa. */
export function indiceEtapa(etapa: string | null | undefined): number {
  return ETAPAS.findIndex((e) => e.id === etapa);
}
