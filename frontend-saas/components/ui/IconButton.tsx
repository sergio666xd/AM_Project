import type { LucideIcon } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/cx";

/** Botón de solo icono con nombre accesible y área táctil de 40 px. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    icon: LucideIcon;
    label: string;
    /** Número sobre el icono (avisos sin leer). */
    badge?: number;
    iconSize?: number;
  }
>(function IconButton({ icon: Icon, label, badge, iconSize = 18, className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={badge ? `${label} (${badge} sin leer)` : label}
      title={label}
      className={cx(
        "relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-[background-color,color,scale] duration-150 hover:bg-manila hover:text-ink active:scale-[0.96]",
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" size={iconSize} strokeWidth={1.75} />
      {badge ? (
        <span aria-hidden="true" className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-bold text-white tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
});
