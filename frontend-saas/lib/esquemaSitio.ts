/**
 * Versión de la estructura del contenido del sitio. Sube cuando cambian las
 * claves de las páginas (la del 5 de noviembre de 2026 trajo los servicios
 * nuevos, los pasos, el equipo y las políticas con datos del responsable).
 *
 * Lo guardado con una versión anterior no se mezcla con el texto base: rige el
 * texto base hasta que la administración vuelva a publicar la página. Así un
 * contenido viejo no tapa los textos nuevos ni deja listas a medio migrar.
 * La fila vieja sigue en la base, por si hace falta consultarla.
 */
export const ESQUEMA_SITIO = 2;

export function contenidoVigente(contenido: unknown): Record<string, unknown> | null {
  if (contenido === null || typeof contenido !== "object" || Array.isArray(contenido)) return null;
  return (contenido as Record<string, unknown>).esquema === ESQUEMA_SITIO ? (contenido as Record<string, unknown>) : null;
}
