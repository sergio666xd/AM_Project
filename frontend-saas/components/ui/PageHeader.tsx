import type { ReactNode } from "react";

/**
 * Consistent page header used at the top of every panel page.
 *
 * ```tsx
 * <PageHeader
 *   title="Usuarios"
 *   description="Gestiona los usuarios de la plataforma"
 *   action={<Button>Nuevo usuario</Button>}
 * />
 * ```
 */
export function PageHeader({
  title,
  description,
  overline,
  action,
  children,
}: {
  title: string;
  description?: string;
  overline?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {overline && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {overline}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-foreground-muted">{description}</p>
        )}
        {children}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      )}
    </div>
  );
}

