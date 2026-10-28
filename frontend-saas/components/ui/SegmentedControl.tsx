"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Option<V extends string> = { value: V; label: ReactNode; count?: number; href?: string };

/**
 * Pestañas compactas para alternar vistas o subconjuntos. Se desplaza
 * horizontalmente en móvil en lugar de partirse en varias líneas.
 */
export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<V>[];
  value: V;
  onChange?: (value: V) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
      <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-manila p-0.5">
        {options.map((option) => {
          const active = option.value === value;
          const className = `inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-semibold transition-[background-color,color,box-shadow] sm:min-h-8 ${
            active ? "bg-sheet text-ink shadow-[0_1px_2px_rgb(24_32_58/0.12)]" : "text-ink-2 hover:text-ink"
          }`;
          const content = (
            <>
              {option.label}
              {option.count !== undefined && (
                <span key={option.count} className={`rounded px-1 text-[11px] leading-5 tabular-nums ${active ? "bg-manila text-ink-2" : "text-ink-2"}`}>
                  {option.count}
                </span>
              )}
            </>
          );
          return option.href ? (
            <Link key={option.value} role="tab" aria-selected={active} href={option.href} className={className}>
              {content}
            </Link>
          ) : (
            <button key={option.value} type="button" role="tab" aria-selected={active} onClick={() => onChange?.(option.value)} className={className}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
