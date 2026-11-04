import type { TonoTag } from "@/components/ui/Tag";
import type { Esquemas } from "@/lib/api-v2/cliente";

export const RUTA_RADICADOS = "/gestion-procesos/abogado/radicados";

export const TONO_CONSULTA: Record<Esquemas["ConsultaRadicado"]["estado"], TonoTag> = {
  consultado: "ok",
  sin_consultar: "neutral",
  consultando: "navy",
  no_encontrado: "warn",
  privado: "neutral",
  error: "bad",
};

export function textoNovedades(cantidad: number): string {
  return cantidad === 1 ? "1 nueva" : `${cantidad} nuevas`;
}
