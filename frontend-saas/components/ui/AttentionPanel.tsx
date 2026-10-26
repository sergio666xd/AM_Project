import type { ReactNode } from "react";
import { AlertTriangle, type LucideIcon } from "lucide-react";

/**
 * Attention panel for dashboard "requires attention" blocks.
 *
 * ```tsx
 * <AttentionPanel title="Requiere atención" items={items} />
 * ```
 */
export function AttentionPanel({
  title = "Requiere atención",
  icon: Icon = AlertTriangle,
  items,
  emptyText = "No hay elementos que requieran atención.",
}: {
  title?: string;
  icon?: LucideIcon;
  items: { id: string | number; label: string; detail?: string; href?: string; tone?: "warning" | "danger" }[];
  emptyText?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-success/20 bg-success-light p-4">
        <p className="text-sm font-medium text-success">{emptyText}</p>
      </div>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-warning/20 bg-warning-light/50">
      <header className="flex items-center gap-2 border-b border-warning/10 px-4 py-3">
        <Icon aria-hidden="true" className="size-4 text-warning" />
        <h2 className="text-sm font-semibold text-warning">{title}</h2>
        <span className="ml-auto rounded-full bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
          {items.length}
        </span>
      </header>
      <ul className="divide-y divide-warning/10">
        {items.map((item) => {
          const Wrapper = item.href ? "a" : "div";
          return (
            <li key={item.id}>
              <Wrapper
                {...(item.href ? { href: item.href } : {})}
                className={`flex items-center gap-3 px-4 py-3 text-sm ${item.href ? "hover:bg-warning-light/80 transition-colors" : ""}`}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${item.tone === "danger" ? "bg-danger" : "bg-warning"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 font-medium text-foreground">
                  {item.label}
                </span>
                {item.detail && (
                  <span className="shrink-0 text-xs text-foreground-muted">
                    {item.detail}
                  </span>
                )}
              </Wrapper>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Lighter section header used inside pages.
 */
export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-foreground-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

