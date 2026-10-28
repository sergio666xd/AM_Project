"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/ui/Logo";
import { cx } from "@/lib/cx";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { MenuCuenta, type EnlaceCuenta } from "./MenuCuenta";
import { estaActiva, itemActivo, type GrupoNav, type ItemNav } from "./navegacion";

/**
 * Riel azul de escritorio (lg en adelante): logo invertido, secciones por
 * grupo y la cuenta al pie. La sección activa lleva el icono en dorado, sin
 * franja lateral. En celular la reemplaza la barra inferior.
 */
export default function Sidebar({
  grupos,
  inicio,
  areaHref,
  enlacesCuenta,
}: {
  grupos: GrupoNav[];
  inicio: string;
  areaHref: string;
  enlacesCuenta?: EnlaceCuenta[];
}) {
  const ruta = usePortalPathname();
  const todos = grupos.flatMap((grupo) => grupo.items.flatMap((item) => [item, ...(item.hijos ?? [])]));
  const activo = itemActivo(ruta, todos, inicio);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-transparent bg-rail text-[#f4f1e8] lg:flex dark:border-line">
      <Link href={inicio} className="mx-3 mb-3 mt-4 block rounded-lg px-2 py-2" aria-label="Ir al inicio">
        <Logo variante="horizontal-inversa" className="h-auto w-[196px]" />
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Principal">
        {grupos.map((grupo, i) => (
          <Grupo key={grupo.titulo ?? i} grupo={grupo} primero={i === 0} activo={activo} ruta={ruta} inicio={inicio} />
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <MenuCuenta areaHref={areaHref} enlaces={enlacesCuenta} enRiel />
      </div>
    </aside>
  );
}

function Grupo({ grupo, primero, activo, ruta, inicio }: { grupo: GrupoNav; primero: boolean; activo?: ItemNav; ruta: string; inicio: string }) {
  const contieneActivo = grupo.items.some((item) => item === activo || item.hijos?.includes(activo as ItemNav));
  const [abiertoManual, setAbiertoManual] = useState<boolean | null>(null);
  const abierto = !grupo.plegable || contieneActivo || (abiertoManual ?? Boolean(grupo.abierto));
  const titulo = "px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9fb0d4]";

  return (
    <div className={primero ? undefined : grupo.plegable ? "mt-3" : "mt-5"}>
      {grupo.titulo &&
        (grupo.plegable ? (
          <button
            type="button"
            onClick={() => setAbiertoManual(!abierto)}
            aria-expanded={abierto}
            className={cx(titulo, "flex min-h-8 w-full items-center gap-1 text-left hover:text-[#f4f1e8]")}
          >
            <ChevronRight aria-hidden="true" size={12} className={cx("transition-transform", abierto && "rotate-90")} />
            <span className="truncate">{grupo.titulo}</span>
          </button>
        ) : (
          <p className={cx(titulo, "mb-1.5")}>{grupo.titulo}</p>
        ))}
      {abierto && (
        <ul className="space-y-0.5">
          {grupo.items.map((item) => (
            <li key={item.id}>
              <Enlace item={item} activo={item === activo} />
              {item.hijos && estaActiva(ruta, item.href, inicio) && (
                <ul className="my-1 ml-5 space-y-0.5 border-l border-white/15 pl-2.5">
                  {item.hijos.map((hijo) => (
                    <li key={hijo.id}>
                      <Enlace item={hijo} activo={hijo === activo} pequeno />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Enlace({ item, activo, pequeno = false }: { item: ItemNav; activo: boolean; pequeno?: boolean }) {
  const Icono = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={item.recargar ? false : undefined}
      onClick={(event) => {
        if (item.recargar) {
          event.preventDefault();
          window.location.assign(item.href);
        }
      }}
      aria-current={activo ? "page" : undefined}
      className={cx(
        "flex items-center rounded-lg transition-colors",
        pequeno ? "h-9 gap-2 px-2.5 text-[13px]" : "h-10 gap-3 px-3 text-[14px]",
        activo ? "bg-rail-active font-semibold text-[#f4f1e8]" : "text-[#c9d1e6] hover:bg-rail-active hover:text-[#f4f1e8]",
      )}
    >
      <Icono aria-hidden="true" size={pequeno ? 15 : 18} strokeWidth={activo ? 2 : 1.75} className={activo ? "text-gold" : undefined} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
