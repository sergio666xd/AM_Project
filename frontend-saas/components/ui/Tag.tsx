import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type TonoTag = "neutral" | "navy" | "gold" | "ok" | "warn" | "bad";

export const TONOS_TAG: Record<TonoTag, string> = {
  neutral: "bg-manila text-ink-2",
  navy: "bg-navy-soft text-navy-ink",
  gold: "bg-gold-soft text-gold-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

/** Etiqueta de estado: siempre con texto (y a veces icono), nunca solo color. */
export function Tag({
  tone = "neutral",
  icon: Icon,
  children,
  className,
}: {
  tone?: TonoTag;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold", TONOS_TAG[tone], className)}>
      {Icon && <Icon aria-hidden="true" size={12} strokeWidth={2.25} />}
      {children}
    </span>
  );
}
