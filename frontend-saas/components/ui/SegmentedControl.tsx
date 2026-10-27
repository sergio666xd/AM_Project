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
      <div className="inline-flex shrink-0 gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-1">
        {options.map((option) => {
          const active = option.value === value;
          const className = `inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-3 text-sm font-medium motion-press ${
            active ? "bg-brand-900 text-white shadow-xs dark:bg-brand-800" : "text-foreground-secondary hover:bg-surface-hover hover:text-foreground"
          }`;
          const content = (
            <>
              {option.label}
              {option.count !== undefined && (
                <span key={option.count} className={`motion-fade-in rounded-full px-1.5 text-xs leading-5 ${active ? "bg-white/20 text-white" : "bg-surface-hover text-foreground-muted"}`}>
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
