import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Remove internal padding (useful for tables/lists flush to edges) */
  flush?: boolean;
}

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
    <section
      className={`rounded-[var(--radius-lg)] border border-border bg-surface shadow-xs ${className}`}
      {...props}
    >
      {(title || description || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
            )}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
