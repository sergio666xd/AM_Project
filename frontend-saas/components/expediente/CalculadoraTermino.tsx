"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CalendarCheck2, Calculator } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { diaCorto, diaLargo, hoyISO } from "@/lib/fechas";

type Termino = Esquemas["Termino"];

export const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-strong bg-sheet px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/25 sm:min-h-10 sm:text-[14px]";
export const ETIQUETA = "mb-1.5 block text-[13px] font-semibold text-ink-2";

/**
 * Calcula el vencimiento de un término en días hábiles (festivos de Colombia y
 * vacancia judicial incluidos). Con `onUsar`, ofrece pasar la fecha a otro formulario.
 */
export function CalculadoraTermino({
  notificacionInicial,
  onUsar,
  compacta = false,
}: {
  notificacionInicial?: string;
  onUsar?: (vence: string, termino: Termino) => void;
  compacta?: boolean;
}) {
  const id = useId();
  const [notificacion, setNotificacion] = useState(notificacionInicial ?? hoyISO());
  const [dias, setDias] = useState("");
  const [resultado, setResultado] = useState<Termino | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  // Sin <form>: la calculadora vive dentro del formulario de la tarea.
  function alPulsar(evento: KeyboardEvent) {
    if (evento.key === "Enter") {
      evento.preventDefault();
      void calcular();
    }
  }

  async function calcular() {
    const n = Number(dias);
    if (!notificacion || !Number.isInteger(n) || n < 1 || n > 365) {
      setError("Escribe la fecha de notificación y un término de 1 a 365 días hábiles.");
      return;
    }
    setCalculando(true);
    setError(null);
    const { data, error: fallo } = await api.POST("/api/v2/terminos/calcular", { body: { notificacion, dias: n } });
    setCalculando(false);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      setResultado(null);
      return;
    }
    setResultado(data);
  }

  return (
    <div>
      <div role="group" aria-label="Calcular un término" onKeyDown={alPulsar} className={compacta ? "grid grid-cols-[1fr_7rem] gap-3" : "grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"}>
        <div>
          <label htmlFor={`${id}-notificacion`} className={ETIQUETA}>Notificado el</label>
          <input id={`${id}-notificacion`} type="date" value={notificacion} onChange={(e) => { setNotificacion(e.target.value); setResultado(null); }} className={CAMPO} />
        </div>
        <div>
          <label htmlFor={`${id}-dias`} className={ETIQUETA}>Días hábiles</label>
          <input
            id={`${id}-dias`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="10"
            value={dias}
            onChange={(e) => { setDias(e.target.value.replace(/\D/g, "").slice(0, 3)); setResultado(null); }}
            className={`${CAMPO} tabular-nums`}
          />
        </div>
        <Button type="button" variant="secondary" loading={calculando} icon={<Calculator size={16} />} className={compacta ? "col-span-2" : ""} onClick={() => void calcular()}>
          Calcular
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}

      <div aria-live="polite">
        {resultado && (
          <div className="motion-rise-in mt-4 rounded-xl bg-manila px-4 py-3.5">
            <p className="text-[13px] font-semibold text-ink-2">Vence el</p>
            <p className="font-display text-[22px] leading-tight text-ink first-letter:uppercase">{diaLargo(resultado.vence)}</p>
            <p className="mt-1 text-[13px] text-ink-2">
              {resultado.dias} {resultado.dias === 1 ? "día hábil" : "días hábiles"}, contados desde el {diaCorto(resultado.inicia)}.
            </p>
            {resultado.inhabiles.length > 0 && (
              <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5 text-[13px] text-ink-2">
                {resultado.inhabiles.map((p) => (
                  <li key={p.desde}>
                    <span className="tabular-nums">{p.desde === p.hasta ? diaCorto(p.desde) : `${diaCorto(p.desde)} al ${diaCorto(p.hasta)}`}</span>
                    {" · "}
                    {p.motivo}
                  </li>
                ))}
              </ul>
            )}
            {onUsar && (
              <Button type="button" size="sm" variant="primary" className="mt-3" icon={<CalendarCheck2 size={15} />} onClick={() => onUsar(resultado.vence, resultado)}>
                Usar como fecha límite
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
