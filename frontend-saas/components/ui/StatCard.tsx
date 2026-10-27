import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";

/**
 * Compact KPI/stat card for dashboards.
 *
 * ```tsx
 * <StatCard label="Procesos activos" value={42} icon={FolderOpen} href="/procesos" />
 * ```
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  detail,
  href,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Extra context line, e.g. "+3 esta semana" */
  detail?: string;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<string, string> = {
    default: "border-border",
    warning: "border-border border-l-warning border-l-[3px]",
    danger: "border-border border-l-danger border-l-[3px]",
    success: "border-border border-l-success border-l-[3px]",
  };

  const iconTones: Record<string, string> = {
    default: "text-brand-700",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
  };

  const Wrapper = href ? "a" : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group flex min-w-0 flex-col gap-2 rounded-[var(--radius-lg)] border bg-surface p-3 shadow-xs transition-shadow sm:flex-row sm:items-start sm:gap-4 sm:p-4 ${href ? "motion-hover-lift" : ""} ${toneClasses[tone]}`}
    >
      {Icon && (
        <span className={`grid size-8 shrink-0 place-items-center sm:mt-0.5 sm:size-9 rounded-[var(--radius-md)] bg-brand-50 ${iconTones[tone]}`}>
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-foreground-muted">{label}</p>
        <p className="mt-0.5 font-display text-[26px] font-medium leading-tight tabular-nums text-foreground">{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</p>
        {detail && (
          <p className="mt-0.5 text-xs text-foreground-muted">{detail}</p>
        )}
      </div>
    </Wrapper>
  );
}

