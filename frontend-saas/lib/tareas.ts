import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";

export type Tarea = Esquemas["TareaResumen"];
export type EstadoTarea = Tarea["estado"];
export type PrioridadTarea = Tarea["prioridad"];

export const ESTADOS: { id: EstadoTarea; nombre: string }[] = [
  { id: "PENDIENTE", nombre: "Pendiente" },
  { id: "EN_CURSO", nombre: "En curso" },
  { id: "COMPLETADA", nombre: "Completada" },
  { id: "CANCELADA", nombre: "Cancelada" },
];

export const PRIORIDADES: { id: PrioridadTarea; nombre: string; tono: TonoTag; orden: number }[] = [
  { id: "URGENTE", nombre: "Urgente", tono: "bad", orden: 4 },
  { id: "ALTA", nombre: "Alta", tono: "warn", orden: 3 },
  { id: "MEDIA", nombre: "Media", tono: "navy", orden: 2 },
  { id: "BAJA", nombre: "Baja", tono: "neutral", orden: 1 },
];

export function nombreEstado(estado: EstadoTarea): string {
  return ESTADOS.find((e) => e.id === estado)?.nombre ?? estado;
}

export function prioridad(id: PrioridadTarea) {
  return PRIORIDADES.find((p) => p.id === id) ?? PRIORIDADES[2];
}

export function estaAbierta(tarea: Pick<Tarea, "estado">): boolean {
  return tarea.estado === "PENDIENTE" || tarea.estado === "EN_CURSO";
}

export const RUTA_TAREA = (id: number) => `/gestion-procesos/abogado/tareas/${id}`;
