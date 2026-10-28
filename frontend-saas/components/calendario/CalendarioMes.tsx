"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Tag, type TonoTag } from "@/components/ui/Tag";
import { cx } from "@/lib/cx";
import { diaLargo, hoyISO, lunesDe, sumarDias } from "@/lib/fechas";

/** Algo que ocurre o vence un día: un evento de la agenda o una tarea. */
export type ElementoCalendario = {
  clave: string;
  titulo: string;
  /** Día en Bogotá, "2026-10-30". */
  dia: string;
  /** "9:40 a. m.", o nada si es de todo el día. */
  hora?: string;
  etiqueta: string;
  tono: TonoTag;
  detalle?: string | null;
  href: string;
  tachado?: boolean;
};

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const mesAnio = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });

function primeroDelMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function moverMes(iso: string, meses: number) {
  const [a, m] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1 + meses, 1));
  return fecha.toISOString().slice(0, 10);
}

/**
 * Mes en cuadrícula con lo de cada día. En escritorio cada celda muestra los
 * dos primeros títulos; en el celular, un punto con la cantidad. Al elegir un
 * día, su lista completa aparece debajo.
 */
export function CalendarioMes({
  elementos,
  mes,
  onMes,
  vacio = "No hay nada este día.",
}: {
  elementos: ElementoCalendario[];
  /** Cualquier día del mes que se muestra. */
  mes: string;
  onMes: (mes: string) => void;
  vacio?: string;
}) {
  const hoy = hoyISO();
  const [elegido, setElegido] = useState(hoy.slice(0, 7) === mes.slice(0, 7) ? hoy : primeroDelMes(mes));
  const inicio = lunesDe(primeroDelMes(mes));
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i));
  const porDia = useMemo(() => {
    const mapa = new Map<string, ElementoCalendario[]>();
    for (const e of elementos) mapa.set(e.dia, [...(mapa.get(e.dia) ?? []), e]);
    return mapa;
  }, [elementos]);
  const delDia = porDia.get(elegido) ?? [];

  function cambiarMes(delta: number) {
    const nuevo = moverMes(primeroDelMes(mes), delta);
    onMes(nuevo);
    setElegido(nuevo.slice(0, 7) === hoy.slice(0, 7) ? hoy : nuevo);
  }

  return (
    <section aria-label="Calendario" className="overflow-hidden rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line)]">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 aria-live="polite" className="font-display text-[19px] text-ink first-letter:uppercase">{mesAnio.format(new Date(`${primeroDelMes(mes)}T12:00:00Z`))}</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink"><ChevronLeft size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => { onMes(hoy); setElegido(hoy); }} className="min-h-10 rounded-lg px-3 text-[13px] font-semibold text-ink-2 hover:bg-manila hover:text-ink">Hoy</button>
          <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink"><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-line">
        {DIAS.map((d) => <div key={d} className="py-2 text-center text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((dia, i) => {
          const items = porDia.get(dia) ?? [];
          const delMes = dia.slice(0, 7) === mes.slice(0, 7);
          const seleccionado = dia === elegido;
          return (
            <button
              key={dia}
              type="button"
              onClick={() => setElegido(dia)}
              aria-pressed={seleccionado}
              aria-label={`${diaLargo(dia)}: ${items.length === 0 ? "nada" : items.length === 1 ? "1 elemento" : `${items.length} elementos`}`}
              className={cx(
                "flex min-h-16 flex-col gap-1 border-line p-1.5 text-left transition-colors sm:min-h-24 sm:p-2",
                i % 7 !== 6 && "border-r",
                i < 35 && "border-b",
                seleccionado ? "bg-navy-soft" : "hover:bg-manila/60",
              )}
            >
              <span className={cx(
                "grid size-7 place-items-center self-center rounded-full text-[13px] tabular-nums sm:self-start",
                dia === hoy ? "bg-navy font-semibold text-white" : delMes ? "text-ink" : "text-ink-3/60",
              )}>
                {Number(dia.slice(8))}
              </span>
              {items.length > 0 && (
                <>
                  <span className="mx-auto inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-navy-ink sm:hidden">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />{items.length}
                  </span>
                  <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {items.slice(0, 2).map((e) => (
                      <span key={e.clave} className={cx("truncate rounded px-1.5 py-0.5 text-[11.5px] font-medium", e.tono === "bad" ? "bg-bad-soft text-bad" : e.tono === "gold" ? "bg-gold-soft text-gold-ink" : "bg-manila text-ink-2", e.tachado && "line-through opacity-70")}>
                        {e.hora && <span className="tabular-nums">{e.hora.replace(/\s?[ap]\. m\./, "")} </span>}{e.titulo}
                      </span>
                    ))}
                    {items.length > 2 && <span className="px-1.5 text-[11.5px] font-semibold text-ink-3">+{items.length - 2} más</span>}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
      <section aria-live="polite" aria-label={`Lo del ${diaLargo(elegido)}`} className="border-t border-line p-4 sm:p-5">
        <h3 className="text-[14px] font-semibold first-letter:uppercase text-ink">{diaLargo(elegido)}</h3>
        {delDia.length === 0 ? (
          <p className="mt-1.5 text-[14px] text-ink-3">{vacio}</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {delDia.map((e) => (
              <li key={e.clave}>
                <Link href={e.href} className="flex items-start gap-3 rounded-lg px-3 py-2.5 shadow-[0_0_0_1px_var(--line)] transition-colors hover:bg-manila/60">
                  <span className="w-[4.5rem] shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-2">{e.hora ?? "Todo el día"}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block font-semibold text-pretty text-ink", e.tachado && "line-through opacity-70")}>{e.titulo}</span>
                    {e.detalle && <span className="block truncate text-[13px] text-ink-3">{e.detalle}</span>}
                  </span>
                  <Tag tone={e.tono}>{e.etiqueta}</Tag>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
