import { cx } from "@/lib/cx";

/** Línea de etapas del proceso: hechas en azul, la actual en dorado. */
export function Etapas({
  etapas,
  actual,
  compacta = false,
  grande = false,
  className,
}: {
  etapas: string[];
  actual: number;
  compacta?: boolean;
  /** Letra más grande para el portal del cliente. */
  grande?: boolean;
  className?: string;
}) {
  return (
    <ol className={cx("flex w-full min-w-0 items-start", className)} aria-label="Etapas del proceso">
      {etapas.map((etapa, i) => {
        const hecha = i < actual;
        const aqui = i === actual;
        return (
          <li key={etapa} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={aqui ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className={cx("absolute right-1/2 top-[7px] h-[2px] w-full", i <= actual ? "bg-navy" : "bg-line-strong")} />}
            <span
              aria-hidden="true"
              className={cx(
                "relative z-10 size-4 rounded-full border-2",
                hecha ? "border-navy bg-navy" : aqui ? "border-gold bg-gold shadow-[0_0_0_4px_var(--gold-soft)]" : "border-line-strong bg-sheet",
              )}
            />
            <span className={cx(compacta ? "sr-only" : "mt-2 hidden px-1 leading-tight sm:block", grande ? "text-[14px]" : "text-[12px]", aqui ? "font-semibold text-ink" : "text-ink-2")}>
              {etapa}
              {hecha && <span className="sr-only"> (terminada)</span>}
              {aqui && <span className="sr-only"> (etapa actual)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
