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
  // El tono va en el icono y su fondo, nunca en una franja lateral.
  const iconTones: Record<string, string> = {
    default: "bg-navy-soft text-navy-ink",
    warning: "bg-warn-soft text-warn",
    danger: "bg-bad-soft text-bad",
    success: "bg-ok-soft text-ok",
  };

  const Wrapper = href ? "a" : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group flex min-w-0 flex-col gap-2 rounded-xl bg-sheet p-3 shadow-sheet transition-shadow sm:flex-row sm:items-start sm:gap-4 sm:p-4 ${href ? "hover:shadow-pop" : ""}`}
    >
      {Icon && (
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg sm:mt-0.5 sm:size-9 ${iconTones[tone]}`}>
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-ink-2">{label}</p>
        <p className="mt-0.5 font-display text-[26px] leading-tight tabular-nums text-ink">{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</p>
        {detail && (
          <p className="mt-0.5 text-[12px] text-ink-3">{detail}</p>
        )}
      </div>
    </Wrapper>
  );
}

