import type { ReactNode } from "react";

/**
 * Encabezado de página: título en Georgia (la voz del expediente) y, a la
 * derecha, las acciones.
 *
 * ```tsx
 * <PageHeader title="Procesos" description="12 activos" action={<Button>Nuevo proceso</Button>} />
 * ```
 */
export function PageHeader({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** @deprecated El sistema no usa rótulos sobre el título; se ignora. */
  overline?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-normal leading-tight text-ink sm:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-[14px] text-ink-3">{description}</p>}
        {children}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
