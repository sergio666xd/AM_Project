"use client";

import { cx } from "@/lib/cx";

/** Un interruptor de 44 px de alto, con su nombre para lectores de pantalla. */
export function Interruptor({ activo, onCambio, etiqueta, deshabilitado }: {
  activo: boolean;
  onCambio: (valor: boolean) => void;
  etiqueta: string;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className="group grid min-h-11 min-w-14 place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        aria-hidden="true"
        className={cx(
          "relative h-7 w-12 rounded-full transition-colors duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-navy",
          activo ? "bg-navy" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute left-0.5 top-0.5 size-6 rounded-full bg-sheet shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-150 ease-out",
            activo && "translate-x-5",
          )}
        />
      </span>
    </button>
  );
}
