"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { usePresence } from "@/lib/usePresence";

/**
 * Panel lateral para fichas y formularios cortos. En escritorio se abre a la
 * derecha sin perder el contexto; en celular sube como hoja inferior.
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
    <div className={`fixed inset-0 z-[70] flex items-end justify-end sm:items-stretch ${closing ? "pointer-events-none" : ""}`} role="presentation">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose} className={`absolute inset-0 bg-scrim ${closing ? "motion-fade-out" : "motion-fade-in"}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-sheet shadow-pop outline-none sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-2xl ${width === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"} ${closing ? "motion-drawer-out" : "motion-drawer-in"}`}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
        <header className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-3 sm:pt-[max(env(safe-area-inset-top),16px)]">
          <div className="min-w-0 flex-1">
            {overline && <p className="text-[13px] text-ink-3">{overline}</p>}
            <h2 id={titleId} className="break-words font-display text-[21px] leading-snug text-ink">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-ink-3">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-manila hover:text-ink"
          >
            <X aria-hidden="true" size={18} strokeWidth={1.75} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-sheet-2 px-5 pt-3.5 pb-[max(env(safe-area-inset-bottom),14px)] sm:rounded-bl-2xl">
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
          <dt className="text-[13px] font-semibold text-ink-2">{item.label}</dt>
          <dd className="mt-0.5 break-words text-[14px] text-ink">{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
