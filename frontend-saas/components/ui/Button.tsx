import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-950 focus-visible:ring-brand-700",
  secondary:
    "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 border border-neutral-200 focus-visible:ring-brand-700",
  outline:
    "border border-border bg-surface text-foreground hover:bg-surface-hover active:bg-neutral-200 focus-visible:ring-brand-700",
  ghost:
    "text-foreground-secondary hover:bg-surface-hover hover:text-foreground active:bg-neutral-200 focus-visible:ring-brand-700",
  danger:
    "bg-danger text-white hover:bg-[#9A1E2C] active:bg-[#841925] focus-visible:ring-danger",
  gold:
    "bg-gold-400 text-brand-950 hover:bg-gold-500 active:bg-gold-600 focus-visible:ring-gold-400",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 gap-1.5 px-3 text-[13px]",
  md: "min-h-11 gap-2 px-4 text-sm",
  lg: "min-h-12 gap-2 px-5 text-[15px]",
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

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
      className={`inline-flex items-center justify-center rounded-[var(--radius-md)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
