import type { HTMLAttributes } from "react";

/**
 * Status tones mapped to semantic colours.
 *
 * ─ normal: in-progress / informational (blue)
 * ─ attention / pending: needs review (amber)
 * ─ risk / overdue / rejected: error state (red)
 * ─ completed: success (green)
 * ─ review: informational (blue, softer)
 * ─ archived: neutral
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

const tones: Record<StatusTone, string> = {
  normal:    "bg-brand-100 text-brand-900",
  attention: "bg-warning-light text-warning",
  risk:      "bg-danger-light text-danger",
  pending:   "bg-warning-light text-warning",
  overdue:   "bg-danger-light text-danger",
  completed: "bg-success-light text-success",
  review:    "bg-info-light text-info",
  rejected:  "bg-danger-light text-danger",
  archived:  "bg-neutral-100 text-neutral-600",
};

export function Badge({
  tone = "normal",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
