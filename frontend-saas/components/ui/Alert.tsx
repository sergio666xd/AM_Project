import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

const kinds = {
  info: { icon: Info, classes: "border-info/30 bg-info-light text-info", role: "status" as const },
  success: { icon: CheckCircle2, classes: "border-success/30 bg-success-light text-success", role: "status" as const },
  warning: { icon: TriangleAlert, classes: "border-warning/30 bg-warning-light text-warning", role: "status" as const },
  error: { icon: AlertCircle, classes: "border-danger/30 bg-danger-light text-danger", role: "alert" as const },
};

export function Alert({
  kind = "info",
  title,
  children,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { kind?: keyof typeof kinds; title?: string; children?: ReactNode }) {
  const config = kinds[kind];
  const Icon = config.icon;
  return (
    <div role={config.role} className={`flex gap-3 rounded-[var(--radius-md)] border p-4 ${config.classes} ${className}`} {...props}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-1" : ""}>{children}</div>}
      </div>
    </div>
  );
}
