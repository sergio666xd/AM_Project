import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Etiqueta sobre la carátula manila: el tono neutro de Tag se perdería en ese fondo. */
export function EtiquetaCaratula({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-7 items-center rounded-md bg-[color-mix(in_srgb,var(--sheet)_62%,transparent)] px-2 text-[13px] sm:px-2.5 sm:text-[14px] font-semibold text-ink-2", className)}>
      {children}
    </span>
  );
}
