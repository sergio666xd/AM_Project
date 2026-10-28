"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";

// Los siete segmentos oficiales del radicado de 23 dígitos.
const SEGMENTOS: [number, number, string][] = [
  [0, 5, "Ciudad"],
  [5, 7, "Entidad"],
  [7, 9, "Especialidad"],
  [9, 12, "Despacho"],
  [12, 16, "Año"],
  [16, 21, "Consecutivo"],
  [21, 23, "Recurso"],
];

/** Radicado agrupado por segmentos, con botón para copiarlo completo. */
export function Radicado({
  numero,
  copiable = true,
  className,
}: {
  numero: string;
  copiable?: boolean;
  className?: string;
}) {
  const digitos = numero.replace(/\D/g, "");
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  async function copiar(event: React.MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(digitos);
    } catch {
      return;
    }
    setCopiado(true);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setCopiado(false), 1400);
  }

  return (
    <span className={cx("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="truncate font-mono text-[12.5px] tracking-tight text-ink-2 tabular-nums" aria-label={`Radicado ${digitos}`}>
        {digitos.length === 23
          ? SEGMENTOS.map(([desde, hasta, nombre], i) => (
              <span key={nombre} title={nombre} className={i % 2 ? "text-ink-3" : undefined}>
                {digitos.slice(desde, hasta)}
                {i < SEGMENTOS.length - 1 && <span className="inline-block w-[3px]" aria-hidden="true" />}
              </span>
            ))
          : numero}
      </span>
      {copiable && (
        <button
          type="button"
          onClick={copiar}
          aria-label={copiado ? "Radicado copiado" : "Copiar radicado"}
          className="relative inline-flex size-6 shrink-0 items-center justify-center rounded text-ink-3 transition-colors after:absolute after:-inset-2 hover:bg-manila hover:text-ink"
        >
          <span className={cx("absolute transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]", copiado ? "scale-25 opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0")}>
            <Copy aria-hidden="true" size={13} strokeWidth={1.75} />
          </span>
          <span className={cx("absolute text-ok transition-[opacity,scale,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)]", copiado ? "scale-100 opacity-100 blur-0" : "scale-25 opacity-0 blur-[4px]")}>
            <Check aria-hidden="true" size={13} strokeWidth={2.25} />
          </span>
        </button>
      )}
    </span>
  );
}
