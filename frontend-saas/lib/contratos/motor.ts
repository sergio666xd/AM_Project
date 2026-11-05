/**
 * El texto de una plantilla de contrato, resuelto con los datos del formulario.
 *
 * Es el mismo motor que `app/modulos/contratos/motor.py`, que arma el PDF: si se cambia
 * una regla aquí, se cambia también allá. Ambos devuelven bloques con trozos de texto (Run).
 */

import type { Esquemas } from "@/lib/api-v2/cliente";

export type Campo = Esquemas["CampoPlantilla"];
export type TipoCampo = Campo["tipo"];
export type Persona = Esquemas["PersonaContrato"];
export type OtraNotificacion = Esquemas["OtraNotificacion"];
export type DatosContrato = Esquemas["DatosContrato"];
export type PlantillaBase = { cuerpo: string; campos: Campo[]; firmas: { abogado?: string } };

export type Marca = "falta" | "error" | "campo" | "propio" | "lista";
export type Run = { t: string; b?: boolean; i?: boolean; k?: Marca; br?: boolean };
export type Bloque =
  | { tipo: "h1"; runs: Run[] }
  | { tipo: "h2"; runs: Run[] }
  | { tipo: "p"; runs: Run[]; fin: boolean }
  | { tipo: "ul"; items: Run[][] }
  | { tipo: "ol"; items: Run[][] }
  | { tipo: "hr" };
export type Resultado = { bloques: Bloque[]; errores: string[]; desconocidos: string[]; faltan: number };

export const CAMPOS_FIJOS: { grupo: string; campos: [string, string][] }[] = [
  { grupo: "Notificaciones", campos: [["notificaciones", "Destinatarios de las notificaciones"]] },
  { grupo: "Proceso", campos: [["proceso.nombre", "Nombre del proceso"], ["proceso.radicado", "Radicado"], ["proceso.despacho", "Despacho"]] },
  {
    grupo: "Abogado responsable",
    campos: [
      ["abogado.nombre", "Nombre del abogado"], ["abogado.documento", "Cédula del abogado"], ["abogado.tarjeta", "Tarjeta profesional"],
      ["abogado.correo", "Correo del abogado"], ["abogado.telefono", "Teléfono del abogado"], ["abogado.domicilio", "Domicilio del abogado"],
    ],
  },
  {
    grupo: "Fecha y lugar",
    campos: [["fecha.hoy", "Fecha de hoy, en letras"], ["fecha.dia", "Día"], ["fecha.mes", "Mes en letras"], ["fecha.anio", "Año"], ["fecha.ciudad", "Ciudad de firma"]],
  },
];
export const ETIQUETA_FIJA: Record<string, string> = Object.fromEntries(CAMPOS_FIJOS.flatMap((g) => g.campos));
export const PREFIJOS_RESERVADOS = ["proceso", "abogado", "fecha", "notificaciones"];
export const DATOS_PERSONA: Record<string, string> = { nombre: "Nombre", cedula: "Cédula", ciudad: "Ciudad", direccion: "Dirección", correo: "Correo", telefono: "Teléfono" };
export const TIPOS: Record<TipoCampo, string> = {
  texto: "Texto corto", parrafo: "Texto largo", numero: "Número", pesos: "Valor en pesos", porcentaje: "Porcentaje", fecha: "Fecha",
  opciones: "Lista de opciones", lista: "Lista de personas",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const RE_TOKEN = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}|\{\{([^{}]+)\}\}|\*\*(.+?)\*\*|\*([^*\n]+?)\*/g;
const RE_ENFASIS = /\*\*(.+?)\*\*|\*([^*\n]+?)\*/g;

export function fechaEnLetras(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} de ${MESES[m - 1]} de ${y}` : iso;
}

export const pesos = (n: number) => "$" + n.toLocaleString("es-CO").replace(/,/g, ".");

/** El valor de un campo propio tal como va en el texto. */
export function formatear(tipo: TipoCampo | undefined, valor: string | undefined): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  if (tipo === "pesos") {
    const n = Number(v.replace(/\D/g, ""));
    return n ? pesos(n) : "";
  }
  if (tipo === "porcentaje") return `${v} %`;
  if (tipo === "fecha") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaEnLetras(v) : v;
  return v;
}

const estilo = (runs: Run[], marca: Partial<Run>): Run[] => runs.map((r) => (r.br ? r : { ...r, ...marca }));

function unir(partes: Run[][], sep: string, ultimo: string): Run[] {
  return partes.flatMap((p, i) => (i === 0 ? p : [{ t: i === partes.length - 1 ? ultimo : sep }, ...p]));
}

/** Un valor escrito en el formulario: **negrita**, *cursiva* y saltos de línea; nunca resuelve códigos. */
function textoConEnfasis(texto: string): Run[] {
  const salida: Run[] = [];
  texto.split("\n").forEach((linea, i) => {
    if (i) salida.push({ t: "", br: true });
    let ultimo = 0;
    for (const m of linea.matchAll(RE_ENFASIS)) {
      if (m.index! > ultimo) salida.push({ t: linea.slice(ultimo, m.index) });
      salida.push(m[1] != null ? { t: m[1], b: true } : { t: m[2], i: true });
      ultimo = m.index! + m[0].length;
    }
    if (ultimo < linea.length) salida.push({ t: linea.slice(ultimo) });
  });
  return salida.filter((r) => r.t || r.br);
}

const todasF = (ps: Persona[]) => ps.length > 0 && ps.every((p) => p.genero === "f");
function forma(formas: string[], ps: Persona[]): string {
  const plural = ps.length > 1;
  const f = todasF(ps);
  if (formas.length === 4) return formas[(plural ? 2 : 0) + (f ? 1 : 0)];
  return formas[plural ? 1 : 0];
}

type Destinatario = { rotulo?: string; nombre?: string; direccion?: string; correo?: string; telefono?: string };
type Item = Persona | { __def: Campo } | null;

export type Contexto = {
  modo: "plantilla" | "contrato";
  campos: Campo[];
  valores?: Record<string, string>;
  listas?: Record<string, Persona[]>;
  notificaciones?: Destinatario[];
  generoAbogado?: string;
};

function crearResolutor(c: Contexto) {
  const defs = Object.fromEntries(c.campos.filter((x) => x.tipo === "lista").map((x) => [x.clave, x]));
  const propios = Object.fromEntries(c.campos.filter((x) => x.tipo !== "lista").map((x) => [x.clave, x]));
  const previa = c.modo === "plantilla";
  const errores: string[] = [];
  const desconocidos: string[] = [];
  const error = (msg: string, texto?: string): Run[] => {
    errores.push(msg);
    return [{ t: texto ?? msg, k: "error" }];
  };
  const falta = (t: string): Run[] => [{ t: `[${t}]`, k: "falta" }];

  function bloque(nombre: string, interior: string): Run[] {
    const def = defs[nombre];
    if (!def) return error(`No hay una lista «${nombre}».`, `{{#${nombre}}}`);
    if (previa) return [...inline(interior, { __def: def }), { t: " " }, { t: `↻ por cada ${(def.singular || "persona").toLowerCase()}`, k: "lista" }];
    const ps = c.listas?.[nombre] ?? [];
    if (!ps.length) return falta(def.etiqueta || nombre);
    return unir(ps.map((p) => inline(interior, p)), "; ", "; y ");
  }

  function notificaciones(): Run[] {
    const ds = c.notificaciones ?? [];
    if (!ds.length) return falta("Destinatarios de las notificaciones");
    const salida: Run[] = [];
    ds.forEach((d, i) => {
      if (i) salida.push({ t: "", br: true });
      if (d.rotulo) salida.push({ t: `${d.rotulo},`, b: true }, { t: " " });
      ([["nombre", "Nombre"], ["direccion", "Dirección"], ["correo", "Correo"], ["telefono", "Teléfono"]] as const).forEach(([k, l], j) => {
        if (j) salida.push({ t: `; ${l.toLowerCase()}: ` });
        const v = (d[k] ?? "").trim();
        salida.push(...(v ? [{ t: v }] : falta(l)));
      });
    });
    return salida;
  }

  function etiqueta(codigo: string, item: Item): Run[] {
    const t = codigo.trim();
    const literal = `{{${t}}}`;
    if (t.startsWith("#") || t.startsWith("/")) return error(`El bloque ${literal} no abre y cierra en el mismo párrafo.`, literal);
    const dos = t.indexOf(":");
    if (dos >= 0) {
      const ref = t.slice(0, dos).trim();
      const formas = t.slice(dos + 1).split("|").map((x) => x.trim());
      if (ref === ".") {
        if (!item) return error("{{.: …}} solo va dentro de un bloque {{#lista}}.", literal);
        if (formas.length !== 2) return error(`${literal} debe tener 2 formas: masculino | femenino.`, literal);
        if ("__def" in item) return [{ t: formas.join(" / "), k: "campo" }];
        if (!item.genero) return falta(formas.join(" / "));
        return [{ t: formas[item.genero === "f" ? 1 : 0] }];
      }
      if (ref === "abogado") {
        if (formas.length !== 2) return error(`${literal} debe tener 2 formas: masculino | femenino.`, literal);
        if (previa) return [{ t: formas.join(" / "), k: "campo" }];
        return [{ t: formas[c.generoAbogado === "m" ? 0 : 1] }];
      }
      const def = defs[ref];
      if (!def) return error(`No hay una lista «${ref}».`, literal);
      if (formas.length !== 2 && formas.length !== 4) return error(`${literal} debe tener 2 o 4 formas.`, literal);
      if (previa) return [{ t: formas.join(" / "), k: "campo" }];
      const ps = c.listas?.[ref] ?? [];
      if (!ps.length || (formas.length === 4 && ps.some((p) => !p.genero))) return falta(formas.join(" / "));
      return [{ t: forma(formas, ps) }];
    }
    if (t.startsWith(".")) {
      const dato = t.slice(1);
      if (!item) return error(`${literal} solo va dentro de un bloque {{#lista}}.`, literal);
      if (!DATOS_PERSONA[dato]) return error(`Las personas no tienen el dato «${dato}».`, literal);
      if ("__def" in item) return [{ t: `${DATOS_PERSONA[dato]} de cada ${(item.__def.singular || "persona").toLowerCase()}`, k: "campo" }];
      const v = String((item as Record<string, unknown>)[dato] ?? "").trim();
      return v ? [{ t: v }] : falta(DATOS_PERSONA[dato]);
    }
    const punto = t.indexOf(".");
    const base = punto >= 0 ? t.slice(0, punto) : t;
    const sub = punto >= 0 ? t.slice(punto + 1).toLowerCase() : "";
    if (defs[base]) {
      const def = defs[base];
      if (sub !== "rotulo" && sub !== "nombres") return error(`${literal}: use {{#${base}}}…{{/${base}}}, .rotulo o .nombres.`, literal);
      if (sub === "rotulo") return [{ t: def.rotulo ?? "" }];
      const etq = def.etiqueta || base;
      if (previa) return [{ t: `Nombres de ${etq.toLowerCase()}`, k: "campo" }];
      const ps = c.listas?.[base] ?? [];
      if (!ps.length) return falta(etq);
      return unir(ps.map((p) => (p.nombre?.trim() ? [{ t: p.nombre.trim() }] : falta("Nombre"))), ", ", " y ");
    }
    if (previa) {
      if (ETIQUETA_FIJA[t]) return [{ t: ETIQUETA_FIJA[t], k: "campo" }];
      if (propios[t]) return [{ t: propios[t].etiqueta || t, k: "propio" }];
      desconocidos.push(t);
      return error(`${literal} no existe.`, `${literal} sin definir`);
    }
    if (t === "notificaciones") return notificaciones();
    if (!ETIQUETA_FIJA[t] && !propios[t]) {
      desconocidos.push(t);
      return error(`${literal} no existe.`, `${literal} sin definir`);
    }
    const v = c.valores?.[t] ?? "";
    if (v) return propios[t] ? textoConEnfasis(v) : [{ t: v }];
    return falta(ETIQUETA_FIJA[t] || propios[t]?.etiqueta || t);
  }

  function inline(texto: string, item: Item = null): Run[] {
    const salida: Run[] = [];
    let ultimo = 0;
    for (const m of texto.matchAll(RE_TOKEN)) {
      if (m.index! > ultimo) salida.push({ t: texto.slice(ultimo, m.index) });
      if (m[1]) salida.push(...bloque(m[1], m[2]));
      else if (m[3] != null) salida.push(...etiqueta(m[3], item));
      else if (m[4] != null) salida.push(...estilo(inline(m[4], item), { b: true }));
      else salida.push(...estilo(inline(m[5], item), { i: true }));
      ultimo = m.index! + m[0].length;
    }
    if (ultimo < texto.length) salida.push({ t: texto.slice(ultimo) });
    return salida;
  }

  return { inline, errores, desconocidos };
}

/** Parte el Markdown en bloques: una línea de párrafo por bloque, para paginar. */
export function resolverTexto(md: string, contexto: Contexto): Resultado {
  const r = crearResolutor(contexto);
  const salida: Bloque[] = [];
  let parrafo: string[] = [];
  let lista: { tipo: "ul" | "ol"; items: string[] } | null = null;
  const cerrarParrafo = () => {
    parrafo.forEach((l, i) => salida.push({ tipo: "p", fin: i === parrafo.length - 1, runs: r.inline(l) }));
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista) salida.push({ tipo: lista.tipo, items: lista.items.map((t) => r.inline(t)) });
    lista = null;
  };
  for (const crudo of (md || "").split("\n")) {
    const linea = crudo.trimEnd();
    let m: RegExpMatchArray | null;
    if (!linea.trim()) {
      cerrarParrafo();
      cerrarLista();
    } else if ((m = linea.match(/^#\s+(.*)/))) {
      cerrarParrafo();
      cerrarLista();
      salida.push({ tipo: "h1", runs: r.inline(m[1]) });
    } else if ((m = linea.match(/^##\s+(.*)/))) {
      cerrarParrafo();
      cerrarLista();
      salida.push({ tipo: "h2", runs: r.inline(m[1]) });
    } else if (/^-{3,}$/.test(linea.trim())) {
      cerrarParrafo();
      cerrarLista();
      salida.push({ tipo: "hr" });
    } else if ((m = linea.match(/^\s*[-*]\s+(.*)/) ?? linea.match(/^\s*\d+[.)]\s+(.*)/))) {
      const tipo = /^\s*\d/.test(linea) ? "ol" : "ul";
      cerrarParrafo();
      if (lista && (lista as { tipo: string }).tipo !== tipo) cerrarLista();
      if (!lista) lista = { tipo, items: [] };
      (lista as { items: string[] }).items.push(m[1]);
    } else {
      cerrarLista();
      parrafo.push(linea.trim());
    }
  }
  cerrarParrafo();
  cerrarLista();
  const faltan = salida.reduce((n, b) => {
    const grupos = "runs" in b ? [b.runs] : "items" in b ? b.items : [];
    return n + grupos.reduce((m2, rs) => m2 + rs.filter((x) => x.k === "falta").length, 0);
  }, 0);
  return { bloques: salida, errores: [...new Set(r.errores)], desconocidos: [...new Set(r.desconocidos)], faltan };
}

/** La plantilla sin datos: sus errores y los códigos que no existen. */
export const revisar = (p: Pick<PlantillaBase, "cuerpo" | "campos">) => resolverTexto(p.cuerpo, { modo: "plantilla", campos: p.campos });

export const listasDe = (campos: Campo[]) => campos.filter((c) => c.tipo === "lista");

export function destinatarios(campos: Campo[], listas: Record<string, Persona[]>, notif: DatosContrato["notificaciones"] | undefined): Destinatario[] {
  const elegidas = new Set(notif?.personas ?? []);
  const personas = listasDe(campos).flatMap((d) => (listas[d.clave] ?? []).filter((p) => elegidas.has(p.ref)).map((p) => ({ ...p, rotulo: d.rotulo ?? "" })));
  return [...personas, ...(notif?.otras ?? [])];
}

export type Firmantes = { rotulo: string; nombres: string[] }[];

export function firmantes(campos: Campo[], listas: Record<string, Persona[]>): Firmantes {
  return listasDe(campos).filter((d) => d.firma !== false).map((d) => ({ rotulo: d.rotulo ?? "", nombres: (listas[d.clave] ?? []).map((p) => (p.nombre ?? "").trim()) }));
}

export function contextoContrato(plantilla: PlantillaBase, datos: DatosContrato, fijos: Record<string, string>): Contexto {
  const valores: Record<string, string> = { ...fijos };
  for (const c of plantilla.campos) {
    if (c.tipo === "lista") continue;
    const v = formatear(c.tipo, datos.valores?.[c.clave]);
    if (v) valores[c.clave] = v;
  }
  const listas = datos.listas ?? {};
  return {
    modo: "contrato", campos: plantilla.campos, valores, listas,
    notificaciones: destinatarios(plantilla.campos, listas, datos.notificaciones), generoAbogado: fijos["abogado.genero"] ?? "",
  };
}

/** Lo que impide dejar el contrato listo para firmar; el backend aplica las mismas reglas. */
export function faltantes(plantilla: PlantillaBase, datos: DatosContrato, resultado: Resultado): number {
  let n = resultado.faltan;
  for (const c of plantilla.campos) {
    if (c.tipo === "lista") {
      const ps = datos.listas?.[c.clave] ?? [];
      if (c.obligatorio && !ps.length && !usaCodigo(plantilla.cuerpo, c.clave)) n += 1;
      n += ps.filter((p) => !p.nombre?.trim()).length;
    } else if (c.obligatorio && !formatear(c.tipo, datos.valores?.[c.clave]) && !usaCodigo(plantilla.cuerpo, c.clave)) {
      n += 1;
    }
  }
  return n + (resultado.errores.length ? 1 : 0);
}

const RE_CAMPO = /\{\{\s*([\w.]+)\s*\}\}/g;
export const camposUsados = (md: string) => [...new Set([...md.matchAll(RE_CAMPO)].map((m) => m[1]))];
export const usaCodigo = (md: string, clave: string) => new RegExp(`\\{\\{[#/\\s]*${clave}[.:}\\s]`).test(md);
