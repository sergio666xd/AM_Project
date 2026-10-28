import type { HTMLAttributes } from "react";
import { TONOS_TAG, type TonoTag } from "./Tag";

/**
 * Estados de las pantallas existentes, llevados a los tonos de etiqueta del
 * expediente foliado. Para código nuevo, usar `Tag` con su tono directamente.
 */
export type StatusTone =
  | "normal"
  | "attention"
  | "risk"
  | "pending"
  | "overdue"
  | "completed"
  | "review"
  | "rejected"
  | "archived";

const tonos: Record<StatusTone, TonoTag> = {
  normal: "navy",
  attention: "warn",
  risk: "bad",
  pending: "warn",
  overdue: "bad",
  completed: "ok",
  review: "navy",
  rejected: "bad",
  archived: "neutral",
};

export function Badge({
  tone = "normal",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[12px] font-semibold ${TONOS_TAG[tonos[tone]]} ${className}`}
      {...props}
    />
  );
}
