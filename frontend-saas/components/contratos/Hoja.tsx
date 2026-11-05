"use client";

import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Bloque, Firmantes, Run } from "@/lib/contratos/motor";
import { cx } from "@/lib/cx";

/**
 * El documento base: CPS.docx, fijo. Carta, márgenes de CPS, Georgia 12 azul oscuro.
 * El PDF del servidor (app/modulos/contratos/documento.py) usa las mismas medidas.
 */
export const BASE = {
  ancho: 21.59,
  alto: 27.94,
  margenes: { sup: 3.5, inf: 2.7, izq: 2.5, der: 2.5 },
  fuente: 'Georgia, "Gelasio CPS", "Times New Roman", serif',
  tamano: 12,
  interlineado: 1.15,
  color: "#002060",
};
// Encabezado y pie recortados de CPS.pdf, como fracción del alto de la hoja.
const ALTO_ENCABEZADO = 0.12121;
const ARRIBA_PIE = 0.90545;
const ALTO_PIE = 0.05333;
const ARRIBA_NUMERO = 1588 / 1650;

const MARCAS: Record<string, CSSProperties> = {
  falta: { background: "#fbefd6", color: "#8a5a00" },
  error: { background: "#f9e4e1", color: "#a3312a" },
  campo: { background: "#e5eaf4", color: "#1d3a7a" },
  propio: { background: "#f5eed6", color: "#6f581b" },
  lista: { background: "#ece3cd", color: "#454d63" },
};

function Trozos({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.br) return <br key={i} />;
        let nodo: ReactNode = r.t;
        if (r.i) nodo = <em>{nodo}</em>;
        if (r.b) nodo = <strong>{nodo}</strong>;
        if (r.k) nodo = <span style={{ ...MARCAS[r.k], borderRadius: 3, padding: "0 0.2em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>{nodo}</span>;
        return <Fragment key={i}>{nodo}</Fragment>;
      })}
    </>
  );
}

function bloqueHtml(b: Bloque, i: number): ReactNode {
  if (b.tipo === "h1") return <h1 key={i} style={{ fontSize: "1em", fontWeight: 700, textAlign: "center", textTransform: "uppercase", margin: "0 0 1.4em" }}><Trozos runs={b.runs} /></h1>;
  if (b.tipo === "h2") return <h2 key={i} style={{ fontSize: "1em", fontWeight: 700, textTransform: "uppercase", margin: "1em 0 0.3em" }}><Trozos runs={b.runs} /></h2>;
  if (b.tipo === "hr") return <hr key={i} style={{ border: 0, borderTop: "1px solid #999", margin: "1em 0" }} />;
  if (b.tipo === "ul" || b.tipo === "ol") {
    const Lista = b.tipo;
    return (
      <Lista key={i} style={{ margin: "0 0 0.8em", paddingLeft: "1.6em", listStyle: b.tipo === "ol" ? "decimal" : "disc", textAlign: "justify" }}>
        {b.items.map((runs, j) => <li key={j}><Trozos runs={runs} /></li>)}
      </Lista>
    );
  }
  return <p key={i} style={{ margin: b.fin ? "0 0 1em" : 0, textAlign: "justify", minHeight: "1.15em" }}><Trozos runs={b.runs} /></p>;
}

export type Abogado = { nombre: string; documento: string; tarjeta: string };

/** Firmas como en CPS: una debajo de otra; el rótulo de cada lista una sola vez y en seguida sus personas. */
function firmas(grupos: Firmantes, rotuloAbogado: string, abogado: Abogado, cq: (n: number) => string, previa: boolean): ReactNode[] {
  const linea: CSSProperties = { display: "block", width: cq(7.5), borderBottom: "1px solid currentColor" };
  const salida: ReactNode[] = [];
  grupos.forEach((g, gi) => {
    (g.nombres.length ? g.nombres : [""]).forEach((nombre, i) => {
      salida.push(
        <div key={`f${gi}-${i}`} style={{ lineHeight: 1.3, paddingTop: cq(i === 0 ? (gi === 0 ? 1.4 : 0.9) : 0.5), paddingBottom: cq(0.3) }}>
          {i === 0 && <div>{g.rotulo}:</div>}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: cq(1) }}>
            <div>
              <div style={{ ...linea, height: cq(1.3) }} />
              <div>{nombre || (previa ? "«Nombre de cada persona»" : "")}&nbsp;</div>
              <div>C.C. No.</div>
            </div>
            <div style={{ display: "flex", flexShrink: 0, alignItems: "center", justifyContent: "center", textAlign: "center", width: cq(1.9), height: cq(2.3), border: "1px solid #002060", borderRadius: cq(0.35), marginRight: cq(0.8), color: "#c8cddb", fontSize: "0.8em", lineHeight: 1.15 }}>
              Huella<br />índice<br />derecho
            </div>
          </div>
        </div>,
      );
    });
  });
  salida.push(
    <div key="abogado" style={{ lineHeight: 1.3, paddingTop: cq(0.9), paddingBottom: cq(1) }}>
      <div>{rotuloAbogado}:</div>
      <div style={{ marginTop: cq(2.2) }}>
        <div>{abogado.nombre}</div>
        <div>C.C {abogado.documento}</div>
        <div>T.P {abogado.tarjeta.replace(/\./g, "")} del C.S de la J</div>
      </div>
    </div>,
  );
  return salida;
}

/** Reparte el contrato en hojas carta: mide cada bloque en una copia oculta y los acomoda sin partirlos. */
export function Hoja({ bloques, firmantes, rotuloAbogado, abogado, guias = false, previa = false, className }: {
  bloques: Bloque[];
  firmantes: Firmantes;
  rotuloAbogado: string;
  abogado: Abogado;
  guias?: boolean;
  previa?: boolean;
  className?: string;
}) {
  const W = BASE.ancho;
  const m = BASE.margenes;
  const cq = (n: number) => `${(n / W) * 100}cqw`;
  const alto = (fraccion: number) => `${((fraccion * BASE.alto) / W) * 100}cqw`;
  const pt = (n: number) => `calc(${n} * 100cqw / ${(W / 2.54) * 72})`;
  const todos = [...bloques.map(bloqueHtml), ...firmas(firmantes, rotuloAbogado, abogado, cq, previa)];
  const medidor = useRef<HTMLDivElement>(null);
  const [cortes, setCortes] = useState<number[]>([todos.length]);

  // Sin dependencias a propósito: se vuelve a medir después de cada cambio del texto.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = medidor.current;
    if (!el) return;
    const hijos = [...el.children] as HTMLElement[];
    const cuerpo = (el.offsetWidth * (BASE.alto - m.sup - m.inf)) / (W - m.izq - m.der);
    const nuevos: number[] = [];
    let usado = 0;
    hijos.forEach((h, i) => {
      const fin = i + 1 < hijos.length ? hijos[i + 1].offsetTop : el.scrollHeight;
      const altoBloque = fin - h.offsetTop;
      if (usado > 0 && usado + altoBloque > cuerpo) {
        nuevos.push(i);
        usado = 0;
      }
      usado += altoBloque;
    });
    nuevos.push(hijos.length);
    if (nuevos.join() !== cortes.join()) setCortes(nuevos);
  });

  const texto: CSSProperties = { fontFamily: BASE.fuente, fontSize: pt(BASE.tamano), lineHeight: BASE.interlineado, color: BASE.color };
  const paginas = cortes.map((fin, k) => todos.slice(k ? cortes[k - 1] : 0, fin));

  return (
    <div className={cx("relative w-full", className)} style={{ containerType: "inline-size" }}>
      <div ref={medidor} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flow-root" style={{ ...texto, width: cq(W - m.izq - m.der) }}>
        {todos}
      </div>
      <div className="space-y-4">
        {paginas.map((contenido, k) => (
          <div
            key={k}
            className="relative overflow-hidden rounded-[3px] bg-white shadow-[0_1px_3px_rgb(0_20_61/0.12),0_8px_24px_-6px_rgb(0_20_61/0.18)]"
            style={{ ...texto, padding: `${cq(m.sup)} ${cq(m.der)} 0 ${cq(m.izq)}`, height: cq(BASE.alto) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- recorte fijo de CPS.pdf, sin optimizar */}
            <img src="/contratos/cps-encabezado.png" alt={k ? "" : "Encabezado: Alejandra Muñoz, Abogada"} className="absolute left-0 top-0 w-full select-none" style={{ height: alto(ALTO_ENCABEZADO) }} draggable={false} />
            {guias && <div aria-hidden="true" className="pointer-events-none absolute border border-dashed border-[#7d93c4]" style={{ top: cq(m.sup), bottom: cq(m.inf), left: cq(m.izq), right: cq(m.der) }} />}
            <div className="relative flow-root">{contenido}</div>
            {/* eslint-disable-next-line @next/next/no-img-element -- recorte fijo de CPS.pdf, sin optimizar */}
            <img src="/contratos/cps-pie.png" alt={k ? "" : "Pie de página con sedes, correo y teléfono"} className="absolute left-0 w-full select-none" style={{ top: alto(ARRIBA_PIE), height: alto(ALTO_PIE) }} draggable={false} />
            <div className="absolute inset-x-0 text-center font-bold" style={{ top: alto(ARRIBA_NUMERO), fontSize: pt(9), lineHeight: 1 }}>Página {k + 1} de {paginas.length}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
