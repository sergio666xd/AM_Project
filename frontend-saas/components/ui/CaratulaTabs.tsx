"use client";

import Link from "next/link";
import { cx } from "@/lib/cx";

type Pestana<V extends string> = { id: V; label: string; count?: number; href?: string };

/**
 * Pestañas que cuelgan del borde inferior de la carátula. La activa es una
 * hoja blanca con el canto superior dorado y se une con la hoja de abajo.
 */
export function CaratulaTabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Pestana<V>[];
  value: V;
  onChange?: (id: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cx("-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]", className)}>
      {tabs.map((tab) => {
        const activa = tab.id === value;
        const clases = cx(
          "relative flex h-10 shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 text-[14px] font-semibold transition-colors",
          activa
            ? "bg-sheet text-ink shadow-[0_-1px_0_var(--line),1px_0_0_var(--line),-1px_0_0_var(--line)]"
            : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--sheet)_45%,transparent)] hover:text-ink",
        );
        const contenido = (
          <>
            {activa && <span aria-hidden="true" className="absolute inset-x-2.5 top-0 h-[2px] rounded-b bg-gold" />}
            {tab.label}
            {tab.count != null && <span className={cx("rounded px-1 text-[11px] tabular-nums", activa ? "bg-manila text-ink-2" : "text-ink-2")}>{tab.count}</span>}
          </>
        );
        return tab.href ? (
          <Link key={tab.id} role="tab" aria-selected={activa} href={tab.href} className={clases}>
            {contenido}
          </Link>
        ) : (
          <button key={tab.id} type="button" role="tab" aria-selected={activa} onClick={() => onChange?.(tab.id)} className={clases}>
            {contenido}
          </button>
        );
      })}
    </div>
  );
}
