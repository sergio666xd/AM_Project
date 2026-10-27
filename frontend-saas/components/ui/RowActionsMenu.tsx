"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreVertical } from "lucide-react";

export interface RowAction<T> {
  label: string;
  icon?: ReactNode;
  /** Acción al seleccionar. Se ignora si se define `href`. */
  onSelect?: (row: T) => void | Promise<void>;
  /** Navega a esta ruta en lugar de ejecutar `onSelect`. */
  href?: (row: T) => string;
  tone?: "default" | "danger";
  hidden?: (row: T) => boolean;
  disabled?: (row: T) => boolean;
  /** Dibuja un separador antes de esta acción. */
  separated?: boolean;
}

type MenuPosition = { top: number; left: number; placement: "below" | "above" };

const MENU_WIDTH = 224;
const MOBILE_QUERY = "(max-width: 639px)";

/**
 * Menú contextual por fila. Se dibuja en un portal con posición fija para
 * no quedar recortado por contenedores con scroll; en pantallas pequeñas se
 * presenta como hoja inferior, más fácil de usar con el pulgar.
 */
export function RowActionsMenu<T>({
  row,
  actions,
  label = "Acciones",
}: {
  row: T;
  actions: RowAction<T>[];
  label?: string;
}) {
  const visible = actions.filter((action) => !action.hidden?.(row));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    setIsMobile(mobile);
    if (mobile) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = visible.length * 40 + 16;
    const placement = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight ? "above" : "below";
    setPosition({
      top: placement === "below" ? rect.bottom + 4 : rect.top - 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      placement,
    });
  }, [open, visible.length]);

  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])");
    firstItem?.focus();
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    const handleViewportChange = () => close(false);
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [close, open]);

  if (visible.length === 0) return null;

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  // Los eventos de un portal se propagan por el árbol de React: sin esto, un
  // clic en el menú activaría también el clic de la fila.
  const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

  const itemClass = (action: RowAction<T>) =>
    `flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none transition-colors sm:px-3 sm:py-2 ${
      action.tone === "danger"
        ? "text-danger hover:bg-danger-light focus-visible:bg-danger-light"
        : "text-foreground hover:bg-surface-hover focus-visible:bg-surface-hover"
    } aria-disabled:pointer-events-none aria-disabled:opacity-50`;

  const items = visible.map((action, index) => {
    const disabled = action.disabled?.(row) ?? false;
    const content = (
      <>
        {action.icon && <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">{action.icon}</span>}
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
      </>
    );
    return (
      <div key={`${action.label}-${index}`}>
        {action.separated && index > 0 && <div role="separator" className="my-1 border-t border-border" />}
        {action.href && !disabled ? (
          <Link role="menuitem" tabIndex={-1} href={action.href(row)} onClick={() => close(false)} className={itemClass(action)}>
            {content}
          </Link>
        ) : (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (disabled) return;
              close(false);
              void action.onSelect?.(row);
            }}
            className={itemClass(action)}
          >
            {content}
          </button>
        )}
      </div>
    );
  });

  const menu = open && typeof document !== "undefined"
    ? createPortal(
        isMobile ? (
          <div className="motion-fade-in fixed inset-0 z-[90] flex items-end bg-brand-950/40 backdrop-blur-[2px]" role="presentation" onClick={stopPropagation}>
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              onKeyDown={handleMenuKeyDown}
              className="motion-sheet-in w-full rounded-t-[var(--radius-xl)] border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),12px)] pt-2 shadow-lg"
            >
              <div aria-hidden="true" className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" />
              <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
              {items}
            </div>
          </div>
        ) : position ? (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
            onClick={stopPropagation}
            style={{
              top: position.top,
              left: position.left,
              width: MENU_WIDTH,
              transform: position.placement === "above" ? "translateY(-100%)" : undefined,
            }}
            className="fixed z-[90] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface py-1 shadow-lg"
          >
            {/* La animación va en un contenedor interno: el menú ya usa transform para abrirse hacia arriba. */}
            <div className="motion-drop-in" style={{ transformOrigin: position.placement === "above" ? "bottom right" : "top right" }}>{items}</div>
          </div>
        ) : null,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
      >
        <MoreVertical aria-hidden="true" className="size-4" />
      </button>
      {menu}
    </>
  );
}
