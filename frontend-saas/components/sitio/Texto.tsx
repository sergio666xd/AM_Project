import { Fragment, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Texto editable del sitio. Admite lo que ya guarda la administración:
 * párrafos separados por una línea en blanco, "> cita", listas con "- " o
 * "1. ", **negrita**, __subrayado__, *cursiva* y [enlace](/ruta).
 */

const EN_LINEA = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;

function hrefSeguro(href: string): string | null {
  const valor = href.trim();
  if (valor.startsWith("/") && !valor.startsWith("//")) return valor;
  return /^(https:\/\/|mailto:|tel:)/i.test(valor) ? valor : null;
}

export function enLinea(texto: string, prefijo = "t"): ReactNode[] {
  const nodos: ReactNode[] = [];
  let cursor = 0;
  for (const m of texto.matchAll(new RegExp(EN_LINEA.source, "g"))) {
    const i = m.index ?? 0;
    if (i > cursor) nodos.push(texto.slice(cursor, i));
    const clave = `${prefijo}-${i}`;
    if (m[2] !== undefined) {
      const href = hrefSeguro(m[3]);
      nodos.push(href ? <a key={clave} href={href} className="text-navy underline">{enLinea(m[2], clave)}</a> : m[2]);
    } else if (m[4] !== undefined) nodos.push(<strong key={clave} className="font-semibold text-ink">{enLinea(m[4], clave)}</strong>);
    else if (m[5] !== undefined) nodos.push(<span key={clave} className="underline decoration-line-strong decoration-2 underline-offset-[5px]">{enLinea(m[5], clave)}</span>);
    else nodos.push(<em key={clave}>{enLinea(m[6] ?? m[7], clave)}</em>);
    cursor = i + m[0].length;
  }
  if (cursor < texto.length) nodos.push(texto.slice(cursor));
  return nodos;
}

type Bloque = { tipo: "p" | "cita"; lineas: string[] } | { tipo: "ul" | "ol"; items: string[] };

function bloques(texto: string): Bloque[] {
  const salida: Bloque[] = [];
  for (const linea of texto.replace(/\r\n/g, "\n").split("\n")) {
    const ultimo = salida.at(-1);
    if (!linea.trim()) {
      salida.push({ tipo: "p", lineas: [] });
      continue;
    }
    const item = linea.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (item) {
      const tipo = /\d/.test(item[1]) ? "ol" : "ul";
      if (ultimo && ultimo.tipo === tipo) ultimo.items.push(item[2]);
      else salida.push({ tipo, items: [item[2]] });
      continue;
    }
    const cita = linea.match(/^\s*>\s?(.*)$/);
    if (cita) {
      if (ultimo && ultimo.tipo === "cita") ultimo.lineas.push(cita[1]);
      else salida.push({ tipo: "cita", lineas: [cita[1]] });
      continue;
    }
    if (ultimo && ultimo.tipo === "p") ultimo.lineas.push(linea);
    else salida.push({ tipo: "p", lineas: [linea] });
  }
  return salida.filter((b) => ("lineas" in b ? b.lineas.length > 0 : b.items.length > 0));
}

function lineasConSalto(lineas: string[], prefijo: string) {
  return lineas.map((linea, i) => (
    <Fragment key={i}>
      {enLinea(linea, `${prefijo}-${i}`)}
      {i < lineas.length - 1 && <br />}
    </Fragment>
  ));
}

export function Texto({ valor, className }: { valor: string; className?: string }) {
  return (
    <div className={cx("space-y-4 text-[17px] leading-[1.65] text-ink-2", className)}>
      {bloques(valor).map((bloque, i) => {
        const clave = `b${i}`;
        if (bloque.tipo === "cita") {
          // Las frases destacadas hablan con la voz de la firma: Georgia, más grandes.
          return (
            <blockquote key={clave} className="max-w-[34ch] font-display text-[22px] leading-[1.35] text-ink sm:text-[24px]">
              {lineasConSalto(bloque.lineas, clave)}
            </blockquote>
          );
        }
        if (bloque.tipo === "ul" || bloque.tipo === "ol") {
          const Lista = bloque.tipo;
          return (
            <Lista key={clave} className={cx("space-y-1.5 pl-6 marker:text-ink-3", bloque.tipo === "ul" ? "list-disc" : "list-decimal")}>
              {bloque.items.map((item, j) => <li key={j} className="pl-1">{enLinea(item, `${clave}-${j}`)}</li>)}
            </Lista>
          );
        }
        if (bloque.tipo === "p") return <p key={clave} className="max-w-[68ch]">{lineasConSalto(bloque.lineas, clave)}</p>;
        return null;
      })}
    </div>
  );
}
