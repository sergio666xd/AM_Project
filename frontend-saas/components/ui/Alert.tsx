import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { TONOS_TAG } from "./Tag";

const kinds = {
  info: { icon: Info, tone: TONOS_TAG.navy, role: "status" as const },
  success: { icon: CheckCircle2, tone: TONOS_TAG.ok, role: "status" as const },
  warning: { icon: TriangleAlert, tone: TONOS_TAG.warn, role: "status" as const },
  error: { icon: AlertCircle, tone: TONOS_TAG.bad, role: "alert" as const },
};

/** Aviso a lo ancho: fondo teñido, icono, título y texto (nunca solo color). */
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
    <div role={config.role} className={`flex gap-3 rounded-lg px-4 py-3 ${config.tone} ${className}`} {...props}>
      <Icon aria-hidden="true" size={18} strokeWidth={2} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 text-[14px]">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}
