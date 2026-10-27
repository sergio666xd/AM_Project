"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePresence } from "@/lib/usePresence";

/**
 * Panel lateral para fichas de detalle. En escritorio se abre a la derecha
 * sin perder el contexto de la tabla; en móvil ocupa la pantalla completa.
 */
export function Drawer({
  open,
  onClose,
  title,
  overline,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  overline?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const { mounted, closing } = usePresence(open, 180);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      previousFocus.current?.focus?.();
    };
  }, [onClose, open]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className={`fixed inset-0 z-[70] flex justify-end ${closing ? "pointer-events-none" : ""}`} role="presentation">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose} className={`absolute inset-0 bg-brand-950/40 backdrop-blur-[2px] ${closing ? "motion-fade-out" : "motion-fade-in"}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex h-full w-full flex-col bg-surface shadow-lg outline-none sm:border-l sm:border-border ${width === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"} ${closing ? "motion-slide-out-right" : "motion-slide-in-right"}`}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-[max(env(safe-area-inset-top),16px)]">
          <div className="min-w-0 flex-1">
            {overline && <p className="text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">{overline}</p>}
            <h2 id={titleId} className="mt-0.5 break-words text-lg font-semibold leading-snug text-foreground">{title}</h2>
            {subtitle && <div className="mt-1 text-sm text-foreground-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] text-foreground-muted hover:bg-surface-hover hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Lista de pares etiqueta/valor para fichas de detalle. */
export function DetailList({ items }: { items: { label: string; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className={`min-w-0 ${item.wide ? "sm:col-span-2" : ""}`}>
          <dt className="text-xs font-medium text-foreground-muted">{item.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
