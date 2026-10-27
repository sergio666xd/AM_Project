"use client";

import Link from "next/link";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export type MobileTab = { label: string; href: string; icon: LucideIcon; badge?: number };

/** Evento que abre el menú lateral completo desde la barra inferior. */
export const OPEN_MOBILE_NAV_EVENT = "open-mobile-nav";

function isTabActive(pathname: string, href: string, exact: boolean) {
  const current = pathname.replace(/\/+$/, "") || "/";
  const target = href.replace(/\/+$/, "") || "/";
  return exact ? current === target : current === target || current.startsWith(`${target}/`);
}

/**
 * Navegación inferior para móvil con los destinos más frecuentes del panel.
 * El último botón abre el menú lateral con el resto de secciones.
 */
export function MobileTabBar({ tabs, homeHref }: { tabs: MobileTab[]; homeHref: string }) {
  const pathname = usePortalPathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {tabs.slice(0, 4).map((tab) => {
          const active = isTabActive(pathname, tab.href, tab.href === homeHref);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                  active ? "text-primary" : "text-foreground-muted active:text-foreground"
                }`}
              >
                <span className={`motion-press relative grid h-8 w-14 place-items-center rounded-full ${active ? "bg-primary-light" : ""}`}>
                  <Icon aria-hidden="true" className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                  {Boolean(tab.badge) && (
                    <span key={tab.badge} className="motion-pop absolute right-2 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {tab.badge! > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-1">{tab.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_MOBILE_NAV_EVENT))}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-foreground-muted active:text-foreground"
          >
            <span className="grid h-8 w-14 place-items-center"><MoreHorizontal aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  );
}
