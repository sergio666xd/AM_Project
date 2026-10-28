"use client";

import Link from "next/link";
import { MoreHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { usePortalPathname } from "@/lib/usePortalPathname";
import { itemActivo, type GrupoNav, type ItemNav } from "./navegacion";

/**
 * Barra inferior en celular: los cuatro destinos más usados y "Más" con el
 * resto en una hoja. En el portal del cliente es más alta y con letra mayor.
 */
export function MobileTabBar({
  pestanas,
  resto,
  inicio,
  gruposResto,
  grande = false,
}: {
  pestanas: ItemNav[];
  resto: ItemNav[];
  inicio: string;
  /** Para listas largas (administración): el resto agrupado con títulos. */
  gruposResto?: GrupoNav[];
  grande?: boolean;
}) {
  const ruta = usePortalPathname();
  const [mas, setMas] = useState(false);
  const activo = itemActivo(ruta, [...pestanas, ...resto], inicio);
  const enResto = Boolean(activo && resto.includes(activo));
  const grupos = gruposResto ?? [{ titulo: null, items: resto }];

  useEffect(() => {
    if (!mas) return;
    const tecla = (event: KeyboardEvent) => event.key === "Escape" && setMas(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [mas]);

  const alto = grande ? "h-[68px] text-[13px]" : "h-16 text-[11.5px]";
  const icono = grande ? 24 : 22;

  return (
    <>
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {pestanas.map((item) => {
            const activa = item === activo;
            const Icono = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  aria-current={activa ? "page" : undefined}
                  className={cx("relative flex flex-col items-center justify-center gap-1 font-semibold", alto, activa ? "text-navy-ink" : "text-ink-2")}
                >
                  {activa && <span aria-hidden="true" className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-gold" />}
                  <Icono aria-hidden="true" size={icono} strokeWidth={activa ? 2 : 1.75} />
                  <span className="max-w-full truncate px-1">{item.corto ?? item.label}</span>
                </Link>
              </li>
            );
          })}
          {resto.length > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setMas(true)}
                aria-expanded={mas}
                className={cx("relative flex w-full flex-col items-center justify-center gap-1 font-semibold", alto, enResto ? "text-navy-ink" : "text-ink-2")}
              >
                {enResto && <span aria-hidden="true" className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-gold" />}
                <MoreHorizontal aria-hidden="true" size={icono} strokeWidth={1.75} />
                Más
              </button>
            </li>
          )}
        </ul>
      </nav>

      {mas && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div aria-hidden="true" className="motion-fade-in absolute inset-0 bg-scrim" onClick={() => setMas(false)} />
          <div role="dialog" aria-modal="true" aria-label="Más secciones" className="motion-sheet-in absolute inset-x-0 bottom-0 rounded-t-2xl bg-sheet pb-[max(env(safe-area-inset-bottom),12px)] shadow-pop">
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <p className="font-display text-[19px] text-ink">Más secciones</p>
              <button type="button" onClick={() => setMas(false)} aria-label="Cerrar" className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink">
                <X aria-hidden="true" size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-4 pb-3">
              {grupos.map((grupo, i) => (
                <div key={grupo.titulo ?? i} className={i ? "mt-3" : undefined}>
                  {grupo.titulo && <p className="mb-1.5 px-1 text-[12px] font-semibold text-ink-3">{grupo.titulo}</p>}
                  <ul className="grid grid-cols-3 gap-2">
                    {grupo.items.map((item) => {
                      const activa = item === activo;
                      const Icono = item.icon;
                      return (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            onClick={(event) => {
                              setMas(false);
                              if (item.recargar) {
                                event.preventDefault();
                                window.location.assign(item.href);
                              }
                            }}
                            aria-current={activa ? "page" : undefined}
                            className={cx(
                              "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center font-semibold leading-tight",
                              grande ? "text-[15px]" : "text-[13px]",
                              activa ? "bg-navy-soft text-navy-ink" : "text-ink-2 hover:bg-manila hover:text-ink",
                            )}
                          >
                            <Icono aria-hidden="true" size={20} strokeWidth={1.75} />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
