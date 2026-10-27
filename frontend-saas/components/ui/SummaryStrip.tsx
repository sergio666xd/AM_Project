"use client";

import type { ReactNode } from "react";
import { AnimatedNumber } from "./AnimatedNumber";

export type SummaryItem = {
  key: string;
  label: string;
  value: number | string;
  tone?: "default" | "danger" | "warning" | "success";
  icon?: ReactNode;
};

const toneClass = {
  default: "text-foreground",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};

/**
 * Indicadores clave de un listado. Si se pasa `onSelect`, cada indicador
 * actúa como filtro rápido; en móvil se desplazan horizontalmente.
 */
export function SummaryStrip({
  items,
  active,
  onSelect,
}: {
  items: SummaryItem[];
  active?: string | null;
  onSelect?: (key: string | null) => void;
}) {
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {items.map((item) => {
        const selected = active === item.key;
        const body = (
          <>
            <span className="flex items-center gap-2 text-xs font-medium text-foreground-muted">
              {item.icon && <span aria-hidden="true" className="[&>svg]:size-4">{item.icon}</span>}
              {item.label}
            </span>
            <span className={`mt-1 block text-2xl font-semibold tabular-nums ${toneClass[item.tone ?? "default"]}`}>{typeof item.value === "number" ? <AnimatedNumber value={item.value} /> : item.value}</span>
          </>
        );
        const className = `min-w-[9.5rem] snap-start rounded-[var(--radius-lg)] border bg-surface p-3 text-left shadow-[var(--shadow-xs)] transition-colors sm:min-w-0 ${
          selected ? "border-primary ring-2 ring-primary/20" : "border-border"
        }`;
        return onSelect ? (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : item.key)}
            className={`${className} hover:border-border-strong`}
          >
            {body}
          </button>
        ) : (
          <div key={item.key} className={className}>{body}</div>
        );
      })}
    </div>
  );
}
