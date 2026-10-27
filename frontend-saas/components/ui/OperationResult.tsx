import Link from "next/link";
import { CheckCircle2, X } from "lucide-react";

export function OperationResult({
  title,
  description,
  actionHref,
  actionLabel,
  onDismiss,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  onDismiss?: () => void;
}) {
  return (
    <section className="motion-rise-in rounded-xl border border-success/30 bg-success/5 p-4" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className="motion-pop mt-0.5 size-5 shrink-0 text-success [animation-delay:120ms]" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-foreground-muted">{description}</p>}
          {actionHref && actionLabel && <Link href={actionHref} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-success/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-success/10">{actionLabel}</Link>}
        </div>
        {onDismiss && <button type="button" onClick={onDismiss} aria-label="Cerrar confirmación" className="grid size-9 shrink-0 place-items-center rounded-lg text-foreground-muted hover:bg-surface-hover"><X aria-hidden="true" className="size-4" /></button>}
      </div>
    </section>
  );
}
