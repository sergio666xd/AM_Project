import type { HTMLAttributes } from "react";

export type StatusTone = "normal" | "attention" | "risk" | "pending" | "overdue" | "completed" | "review" | "rejected" | "archived";

const tones: Record<StatusTone, string> = {
  normal: "bg-info-light text-info",
  attention: "bg-warning-light text-warning",
  risk: "bg-danger-light text-danger",
  pending: "bg-warning-light text-warning",
  overdue: "bg-danger-light text-danger",
  completed: "bg-success-light text-success",
  review: "bg-info-light text-info",
  rejected: "bg-danger-light text-danger",
  archived: "bg-surface-hover text-foreground-muted",
};

export function Badge({
  tone = "normal",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
