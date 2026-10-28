import type { Esquemas } from "@/lib/api-v2/cliente";
import type { TonoTag } from "@/components/ui/Tag";

export type Contrato = Esquemas["Contrato"];
export type EstadoContrato = Contrato["estado"];
export type GrupoContratos = "en_curso" | "firmados" | "cerrados" | "todos";

export const ESTADO_CONTRATO: Record<EstadoContrato, { nombre: string; tono: TonoTag }> = {
  BORRADOR: { nombre: "Borrador", tono: "neutral" },
  LISTO_PARA_FIRMA: { nombre: "Listo para firmar", tono: "gold" },
  EN_FIRMA: { nombre: "Firma agendada", tono: "navy" },
  FIRMADO: { nombre: "Firmado", tono: "ok" },
  TERMINADO: { nombre: "Terminado", tono: "neutral" },
  ANULADO: { nombre: "Anulado", tono: "bad" },
};

/** La pestaña Contratos del expediente, donde se redacta, se firma y se sube el escaneado. */
export function enlaceContratosDelProceso(procesoId: number): string {
  return `/gestion-procesos/abogado/procesos/${procesoId}/contratos`;
}
