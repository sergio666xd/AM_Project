import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Etiqueta sobre la carátula azul: el tono neutro de Tag se perdería en ese fondo. */
export function EtiquetaCaratula({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-7 items-center rounded-md bg-[var(--cover-chip)] px-2 shadow-[inset_0_0_0_1px_var(--cover-line)] text-[13px] sm:px-2.5 sm:text-[14px] font-semibold text-ink-2", className)}>
      {children}
    </span>
  );
}
