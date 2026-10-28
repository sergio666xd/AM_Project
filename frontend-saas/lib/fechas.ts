/** Fechas a la manera colombiana, siempre en la hora de Bogotá. */
const ZONA = "America/Bogota";

const hora = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true });
const diaMes = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, day: "numeric", month: "short" });
const diaMesAnio = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, day: "numeric", month: "short", year: "numeric" });
const larga = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
const clave = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

function aFecha(valor: string | Date): Date | null {
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** "Hoy, 7:42 a. m.", "Ayer", "9 oct." o "9 oct. 2025". */
export function fechaRelativa(valor: string | Date | null | undefined, ahora = new Date()): string {
  const fecha = valor ? aFecha(valor) : null;
  if (!fecha) return "";
  const dia = clave.format(fecha);
  if (dia === clave.format(ahora)) return `Hoy, ${hora.format(fecha)}`;
  if (dia === clave.format(new Date(ahora.getTime() - 86_400_000))) return "Ayer";
  if (dia.slice(0, 4) === clave.format(ahora).slice(0, 4)) return diaMes.format(fecha);
  return diaMesAnio.format(fecha);
}

/** "martes 3 de noviembre". */
export function fechaLarga(valor: string | Date): string {
  const fecha = aFecha(valor);
  return fecha ? larga.format(fecha) : "";
}
