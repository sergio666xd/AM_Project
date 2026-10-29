import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

// Profundidad con anillos y luces interiores, no con bordes (DESIGN.md).
const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-navy text-on-navy hover:bg-navy-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_20_60/0.25)]",
  secondary:
    "bg-sheet text-ink hover:bg-sheet-2 shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(24_32_58/0.06)]",
  outline:
    "bg-sheet text-ink hover:bg-sheet-2 shadow-[0_0_0_1px_var(--line-strong),0_1px_2px_rgb(24_32_58/0.06)]",
  ghost: "text-ink-2 hover:bg-manila hover:text-ink",
  danger: "bg-sheet text-bad hover:bg-bad-soft shadow-[0_0_0_1px_var(--line-strong)]",
  // Solo para confirmaciones poco frecuentes.
  gold: "bg-gold text-[#2b220a] hover:brightness-[1.04] shadow-[0_1px_2px_rgb(60_45_10/0.25)]",
};

// En celular los controles llegan a 44 px; en escritorio, a la densidad del panel.
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 rounded-md px-2.5 text-[13px] sm:min-h-8",
  md: "min-h-11 gap-2 rounded-lg px-3.5 text-[14px] sm:min-h-10",
  lg: "min-h-12 gap-2 rounded-lg px-5 text-[16px]",
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

const BASE =
  "relative inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,box-shadow,color,scale,filter] duration-150 active:scale-[0.96]";

/** Clases de un botón, para lo que debe verse como botón sin serlo (un enlace). */
export function clasesBoton(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BASE} ${variants[variant]} ${sizes[size]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className = "",
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`${clasesBoton(variant, size)} disabled:pointer-events-none disabled:opacity-50 ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : icon ? (
        <span className="-ml-0.5 inline-flex shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

/** Un enlace con aspecto de botón: navega, no ejecuta una acción. */
export function EnlaceBoton({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode }) {
  return (
    <Link className={`${clasesBoton(variant, size)} ${className}`} {...props}>
      {icon && <span className="-ml-0.5 inline-flex shrink-0">{icon}</span>}
      {children}
    </Link>
  );
}
