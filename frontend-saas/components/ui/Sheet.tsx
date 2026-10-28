import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

/** Hoja blanca sobre el fondo manila: la superficie de contenido. */
export function Sheet({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section {...props} className={cx("rounded-xl bg-sheet shadow-sheet", className)}>
      {children}
    </section>
  );
}

export function SheetHeader({
  title,
  count,
  action,
  className,
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5", className)}>
      <h2 className="flex min-w-0 items-center gap-2 text-[14px] font-semibold text-ink">
        {title}
        {count != null && <span className="rounded bg-manila px-1.5 text-[12px] font-semibold text-ink-2 tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
  );
}
