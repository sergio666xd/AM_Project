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

/** "27 oct." en el año en curso, "27 oct. 2025" en otro. */
export function fechaCorta(valor: string | Date | null | undefined, ahora = new Date()): string {
  const fecha = valor ? aFecha(valor) : null;
  if (!fecha) return "";
  return clave.format(fecha).slice(0, 4) === clave.format(ahora).slice(0, 4) ? diaMes.format(fecha) : diaMesAnio.format(fecha);
}

/** "27 oct., 9:00 a. m." */
export function fechaConHora(valor: string | Date | null | undefined): string {
  const fecha = valor ? aFecha(valor) : null;
  return fecha ? `${fechaCorta(fecha)}, ${hora.format(fecha)}` : "";
}

/** Un día del calendario ("2026-11-12") a mediodía de Bogotá, para que ninguna zona lo corra de día. */
function dia(iso: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? aFecha(`${iso}T12:00:00-05:00`) : null;
}

/** "jueves 12 de noviembre" para un día del calendario. */
export function diaLargo(iso: string): string {
  const fecha = dia(iso);
  return fecha ? larga.format(fecha) : "";
}

/** "12 nov." (o "12 nov. 2027" en otro año) para un día del calendario. */
export function diaCorto(iso: string, ahora = new Date()): string {
  const fecha = dia(iso);
  return fecha ? fechaCorta(fecha, ahora) : "";
}

/** Hoy en Bogotá como "2026-10-28". */
export function hoyISO(ahora = new Date()): string {
  return clave.format(ahora);
}

/** El día de Bogotá de un instante, como "2026-10-28". */
export function diaDe(valor: string | Date): string {
  const fecha = aFecha(valor);
  return fecha ? clave.format(fecha) : "";
}

/** "9:40 a. m." en Bogotá. */
export function horaDe(valor: string | Date): string {
  const fecha = aFecha(valor);
  return fecha ? hora.format(fecha) : "";
}

/** Suma días a un día del calendario: sumarDias("2026-10-28", 7) → "2026-11-04". */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d + dias));
  return fecha.toISOString().slice(0, 10);
}

/** Lunes de la semana de ese día (las semanas empiezan en lunes en Colombia). */
export function lunesDe(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return sumarDias(iso, -((diaSemana + 6) % 7));
}
