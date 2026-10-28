"use client";

import Link from "next/link";
import { ChevronUp, LogOut, MonitorSmartphone, Moon, Settings, Sun, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Initials } from "@/components/ui/Initials";
import { useSession } from "@/context/SessionContext";
import { cx } from "@/lib/cx";
import { useTema } from "@/lib/useTema";

export type EnlaceCuenta = { label: string; href: string; icon: LucideIcon };

const ROLES: Record<string, string> = {
  ADMIN: "Administración",
  ABOGADO_ADMIN: "Abogada de la firma",
  ABOGADO: "Abogado",
  CLIENTE: "Cliente",
};

/**
 * Menú de la cuenta: perfil, configuración, tema y cierre de sesión. En el
 * riel azul muestra nombre y rol; en el encabezado claro, solo las iniciales.
 */
export function MenuCuenta({ areaHref, enlaces, enRiel = false }: { areaHref: string; enlaces?: EnlaceCuenta[]; enRiel?: boolean }) {
  const { user, logout, logoutEverywhere } = useSession();
  const { oscuro, alternar } = useTema();
  const [abierto, setAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const nombre = user?.nombre_completo || "Cuenta";
  const rol = ROLES[user?.rol ?? ""] ?? "";
  const opciones = enlaces ?? [
    { label: "Mi perfil", href: `${areaHref}/perfil`, icon: UserRound },
    { label: "Configuración", href: `${areaHref}/configuracion`, icon: Settings },
  ];

  useEffect(() => {
    if (!abierto) return;
    const fuera = (event: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(event.target as Node)) setAbierto(false);
    };
    const tecla = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const opcion = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] text-ink hover:bg-manila";

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        aria-controls={menuId}
        aria-label={enRiel ? undefined : `Cuenta de ${nombre}`}
        className={cx(
          "flex items-center gap-2.5 rounded-lg text-left transition-colors",
          enRiel ? "w-full p-2 hover:bg-rail-active" : "size-10 justify-center hover:bg-manila",
        )}
      >
        <Initials name={nombre} size={32} className={enRiel ? "bg-rail-chip text-[#f4f1e8]" : undefined} />
        {enRiel && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold text-[#f4f1e8]">{nombre}</span>
              <span className="block truncate text-[12px] text-[#b9c3dc]">{rol}</span>
            </span>
            <ChevronUp aria-hidden="true" size={14} className={cx("shrink-0 text-[#b9c3dc] transition-transform", !abierto && "rotate-180")} />
          </>
        )}
      </button>
      {abierto && (
        <div
          id={menuId}
          className={cx(
            "motion-drop-in absolute z-50 w-64 overflow-hidden rounded-xl bg-sheet p-1.5 shadow-pop",
            enRiel ? "bottom-full left-0 mb-2 origin-bottom-left" : "right-0 top-12",
          )}
        >
          <div className="px-2.5 pb-2 pt-1">
            <p className="truncate text-[14px] font-semibold text-ink">{nombre}</p>
            {user?.email && <p className="truncate text-[12px] text-ink-3">{user.email}</p>}
          </div>
          {opciones.map(({ label, href, icon: Icono }) => (
            <Link key={href} href={href} onClick={() => setAbierto(false)} className={opcion}>
              <Icono aria-hidden="true" size={16} strokeWidth={1.75} /> {label}
            </Link>
          ))}
          <button type="button" onClick={alternar} className={opcion}>
            {oscuro ? <Sun aria-hidden="true" size={16} strokeWidth={1.75} /> : <Moon aria-hidden="true" size={16} strokeWidth={1.75} />}
            {oscuro ? "Tema claro" : "Tema oscuro"}
          </button>
          <div className="my-1 border-t border-line" />
          <button type="button" disabled={saliendo} onClick={() => { setSaliendo(true); void logout(); }} className={opcion}>
            <LogOut aria-hidden="true" size={16} strokeWidth={1.75} /> Cerrar sesión
          </button>
          <button
            type="button"
            disabled={saliendo}
            onClick={() => { setSaliendo(true); void logoutEverywhere(); }}
            className={cx(opcion, "text-[13px] text-ink-2")}
          >
            <MonitorSmartphone aria-hidden="true" size={16} strokeWidth={1.75} /> Cerrar sesión en todos los dispositivos
          </button>
        </div>
      )}
    </div>
  );
}
