import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: typeof Inbox;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-surface-hover text-foreground-muted">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-foreground-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
