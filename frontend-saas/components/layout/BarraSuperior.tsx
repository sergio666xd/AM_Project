"use client";

import Link from "next/link";
import { Moon, Search, Sun } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Logo } from "@/components/ui/Logo";
import { cx } from "@/lib/cx";
import { useTema } from "@/lib/useTema";
import Breadcrumbs from "./Breadcrumbs";
import { ABRIR_BUSQUEDA } from "./BusquedaGlobal";
import { Campana } from "./Campana";
import { MenuCuenta, type EnlaceCuenta } from "./MenuCuenta";

/**
 * Barra superior de los paneles internos: migas en escritorio, búsqueda
 * (Ctrl/Cmd+K), tema, campana de avisos y, en celular, la cuenta.
 */
export function BarraSuperior({
  inicio,
  areaHref,
  fija,
  avisosHref,
  enlacesCuenta,
}: {
  inicio: string;
  areaHref: string;
  fija: boolean;
  avisosHref?: string;
  enlacesCuenta?: EnlaceCuenta[];
}) {
  const { oscuro, alternar } = useTema();
  const abrirBusqueda = () => window.dispatchEvent(new Event(ABRIR_BUSQUEDA));
  return (
    <header
      className={cx(
        "z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-ground/92 px-3 backdrop-blur-md sm:px-5 lg:h-16 lg:px-8",
        fija ? "sticky top-0" : "relative",
      )}
    >
      <Link href={inicio} aria-label="Ir al inicio" className="shrink-0 rounded-lg lg:hidden">
        <Logo variante="emblema" className="size-9 dark:hidden" />
        <Logo variante="emblema-inverso" className="hidden size-9 dark:block" />
      </Link>
      <div className="hidden min-w-0 flex-1 lg:block">
        <Breadcrumbs />
      </div>
      <button
        type="button"
        onClick={abrirBusqueda}
        className="ml-auto hidden h-10 w-full max-w-[420px] items-center gap-2.5 rounded-lg bg-sheet px-3 text-[14px] text-ink-3 shadow-[0_0_0_1px_var(--line-strong)] transition-shadow hover:shadow-[0_0_0_1px_var(--ink-3)] sm:flex"
      >
        <Search aria-hidden="true" size={16} />
        <span className="flex-1 truncate text-left">Buscar proceso, radicado o cliente</span>
        <kbd className="rounded border border-line-strong px-1.5 font-sans text-[11px]">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-0.5 sm:ml-1">
        <IconButton icon={Search} label="Buscar" onClick={abrirBusqueda} className="sm:hidden" />
        <IconButton icon={oscuro ? Sun : Moon} label={oscuro ? "Tema claro" : "Tema oscuro"} onClick={alternar} className="hidden sm:inline-flex" />
        <Campana todosHref={avisosHref ?? `${areaHref}/notificaciones`} />
        <div className="lg:hidden">
          <MenuCuenta areaHref={areaHref} enlaces={enlacesCuenta} />
        </div>
      </div>
    </header>
  );
}
