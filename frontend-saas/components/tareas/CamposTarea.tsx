"use client";

import { useState } from "react";
import { Calculator, ChevronDown } from "lucide-react";

import { CAMPO, CalculadoraTermino, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { cx } from "@/lib/cx";
import { diaCorto, hoyISO } from "@/lib/fechas";
import { PRIORIDADES, type PrioridadTarea } from "@/lib/tareas";

/** Prioridad como pastillas de radio: se elige con un toque y se lee de un vistazo. */
export function SelectorPrioridad({ nombre, valor, onCambio }: { nombre: string; valor: PrioridadTarea; onCambio: (p: PrioridadTarea) => void }) {
  return (
    <fieldset>
      <legend className={ETIQUETA}>Prioridad</legend>
      <div className="flex gap-1 rounded-lg bg-manila p-0.5">
        {[...PRIORIDADES].reverse().map((p) => (
          <label key={p.id} className={cx("inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-md px-2.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-navy/30 sm:min-h-9", valor === p.id ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(24_32_58/0.12)]" : "text-ink-2 hover:text-ink")}>
            <input type="radio" name={nombre} value={p.id} checked={valor === p.id} onChange={() => onCambio(p.id)} className="sr-only" />
            {p.nombre}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Fecha límite con la calculadora de términos plegada debajo. */
export function CampoFechaLimite({
  id,
  fecha,
  onFecha,
  error,
  notificacionInicial,
  opcional = true,
}: {
  id: string;
  fecha: string;
  onFecha: (fecha: string, explicacion: string | null) => void;
  error?: string;
  notificacionInicial?: string;
  opcional?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const [explicacion, setExplicacion] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA}>Fecha límite{opcional && <span className="font-normal text-ink-3"> (opcional)</span>}</label>
      <input
        id={id}
        type="date"
        min={hoyISO()}
        value={fecha}
        onChange={(e) => { setExplicacion(null); onFecha(e.target.value, null); }}
        aria-invalid={error ? true : undefined}
        className={CAMPO}
      />
      {error && <p className="mt-1.5 text-[13px] text-bad">{error}</p>}
      {explicacion && <p className="mt-1.5 text-[12.5px] text-ink-3">{explicacion}</p>}
      <div className="mt-2 rounded-xl shadow-[0_0_0_1px_var(--line)]">
        <button
          type="button"
          aria-expanded={abierta}
          onClick={() => setAbierta((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-[14px] font-semibold text-ink"
        >
          <Calculator aria-hidden="true" size={16} className="text-ink-3" />
          Calcular la fecha por un término judicial
          <ChevronDown aria-hidden="true" size={16} className={cx("ml-auto text-ink-3 transition-transform", abierta && "rotate-180")} />
        </button>
        {abierta && (
          <div className="border-t border-line px-3.5 pb-3.5 pt-3">
            <CalculadoraTermino
              compacta
              notificacionInicial={notificacionInicial}
              onUsar={(vence, termino) => {
                const texto = `Término de ${termino.dias} ${termino.dias === 1 ? "día hábil" : "días hábiles"} notificado el ${diaCorto(termino.notificacion)}.`;
                setExplicacion(texto);
                onFecha(vence, texto);
                setAbierta(false);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
