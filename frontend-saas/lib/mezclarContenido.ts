/** Mezcla lo guardado por la administración sobre el texto base; las listas se reemplazan enteras. */
export function mezclarContenido<T>(base: T, cambio: unknown): T {
  if (Array.isArray(cambio)) return cambio as T;
  if (base !== null && typeof base === "object" && cambio !== null && typeof cambio === "object") {
    const salida: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [clave, valor] of Object.entries(cambio as Record<string, unknown>)) {
      salida[clave] = clave in salida ? mezclarContenido(salida[clave], valor) : valor;
    }
    return salida as T;
  }
  return (cambio ?? base) as T;
}
