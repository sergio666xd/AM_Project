"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { usePresence } from "@/lib/usePresence";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const sizeClass = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-6xl" }[size];
  const { mounted, closing } = usePresence(open, 120);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className={`fixed inset-0 z-[100] grid place-items-center overflow-y-auto p-4 ${closing ? "pointer-events-none" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-hidden="true" onMouseDown={onClose} className={`fixed inset-0 bg-scrim ${closing ? "motion-fade-out" : "motion-fade-in"}`} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1} className={`relative z-[1] max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-2xl bg-sheet shadow-pop outline-none ${sizeClass} ${closing ? "motion-dialog-out" : "motion-dialog-in"}`}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-[21px] leading-snug text-ink">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-[13px] text-ink-3">{description}</p>}
          </div>
          <button type="button" aria-label="Cerrar diálogo" onClick={onClose} className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-manila hover:text-ink"><X aria-hidden="true" size={18} strokeWidth={1.75} /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
