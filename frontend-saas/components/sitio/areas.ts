import type { AreaConsulta } from "@/lib/sitio";

/**
 * Cada área del contenido trae un ícono ("family", "business"…); de ahí sale
 * su ancla en Áreas de práctica y el tema que se marca en el formulario.
 */
const POR_ICONO: Record<string, { ancla: string; area: AreaConsulta }> = {
  family: { ancla: "familia", area: "familia" },
  business: { ancla: "empresas", area: "empresas" },
  building: { ancla: "propiedad-horizontal", area: "propiedad_horizontal" },
  government: { ancla: "publico", area: "publico" },
};

export function areaDeIcono(icono: string, indice: number) {
  return POR_ICONO[icono] ?? { ancla: `area-${indice + 1}`, area: "otro" as AreaConsulta };
}

const AREAS_VALIDAS = new Set<AreaConsulta>(["familia", "empresas", "propiedad_horizontal", "publico", "poliza", "otro"]);

/** Lee ?area= de la dirección; ignora lo que no sea un tema del formulario. */
export function areaDeConsulta(valor: string | string[] | undefined): AreaConsulta | null {
  const area = Array.isArray(valor) ? valor[0] : valor;
  return area && AREAS_VALIDAS.has(area as AreaConsulta) ? (area as AreaConsulta) : null;
}
