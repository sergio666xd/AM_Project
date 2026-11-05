"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cx } from "@/lib/cx";
import { EnlacePortal } from "./EnlacePortal";

const SECCIONES = [
  { label: "Inicio", href: "/" },
  { label: "Servicios", href: "/servicios" },
  { label: "Póliza jurídica", href: "/poliza-juridica" },
  { label: "Quiénes somos", href: "/quienes-somos", tambien: ["/filosofia"] },
  { label: "Contacto", href: "/contacto" },
];

function esActual(ruta: string, seccion: (typeof SECCIONES)[number]): boolean {
  if (seccion.href === "/") return ruta === "/";
  return [seccion.href, ...(seccion.tambien ?? [])].some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

/** Menú del sitio en el encabezado, para computador. */
export function NavSitio() {
  const ruta = usePathname() ?? "/";
  return (
    <nav aria-label="Secciones del sitio" className="max-lg:hidden">
      <ul className="flex items-center gap-1">
        {SECCIONES.map((seccion) => {
          const actual = esActual(ruta, seccion);
          return (
            <li key={seccion.href}>
              <Link
                href={seccion.href}
                aria-current={actual ? "page" : undefined}
                className={cx(
                  "relative flex min-h-10 items-center rounded-md px-3 text-[15px] font-semibold transition-colors duration-150",
                  "after:absolute after:inset-x-3 after:-bottom-[3px] after:h-[3px] after:origin-left after:rounded-full after:bg-gold after:transition-transform after:duration-300",
                  actual ? "text-navy after:scale-x-100" : "text-ink-2 after:scale-x-0 hover:text-navy hover:after:scale-x-100",
                )}
              >
                {seccion.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Menú hamburguesa para celular y tableta. Es un <details>, así abre y cierra
 * aun sin JavaScript; la clave por ruta lo cierra al cambiar de página.
 */
export function MenuMovil() {
  const ruta = usePathname() ?? "/";
  return (
    <details key={ruta} className="group/menu lg:hidden">
      <summary
        aria-label="Abrir el menú"
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg text-ink shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sheet-2 [&::-webkit-details-marker]:hidden"
      >
        <Menu aria-hidden="true" size={22} strokeWidth={2} className="group-open/menu:hidden" />
        <X aria-hidden="true" size={22} strokeWidth={2} className="hidden group-open/menu:block" />
      </summary>
      <div className="absolute inset-x-0 top-full z-40 border-b border-line bg-sheet shadow-pop">
        <nav aria-label="Secciones del sitio" className="mx-auto w-full max-w-[1180px] px-4 py-3 sm:px-6">
          <ul className="divide-y divide-line">
            {SECCIONES.map((seccion) => {
              const actual = esActual(ruta, seccion);
              return (
                <li key={seccion.href}>
                  <Link
                    href={seccion.href}
                    aria-current={actual ? "page" : undefined}
                    className={cx(
                      "flex min-h-13 items-center gap-3 py-3 text-[17px] font-semibold",
                      actual ? "text-navy" : "text-ink",
                    )}
                  >
                    {actual && <span aria-hidden="true" className="h-5 w-[3px] rounded-full bg-gold" />}
                    {seccion.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <EnlacePortal className="flex min-h-13 items-center py-3 text-[16px] font-semibold text-ink-2">Portal de clientes</EnlacePortal>
            </li>
          </ul>
        </nav>
      </div>
    </details>
  );
}
