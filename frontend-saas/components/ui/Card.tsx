import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Sin relleno interno (tablas o listas pegadas a los bordes). */
  flush?: boolean;
}

/** Hoja de contenido con encabezado opcional (ver `Sheet` para la versión mínima). */
export function Card({
  title,
  description,
  action,
  flush = false,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <section className={`rounded-xl bg-sheet shadow-sheet ${className}`} {...props}>
      {(title || description || action) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}
