"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cx } from "@/lib/cx";

export type SeccionSitio = "consulta" | "areas" | "poliza" | "firma" | "contacto";

const SECCIONES: { id: SeccionSitio; label: string; href: string }[] = [
  { id: "consulta", label: "Cuéntenos su caso", href: "/" },
  { id: "areas", label: "Áreas de práctica", href: "/areas-de-practica" },
  { id: "poliza", label: "Póliza jurídica", href: "/poliza-juridica" },
  { id: "firma", label: "Quiénes somos", href: "/quienes-somos" },
  { id: "contacto", label: "Contacto", href: "/contacto" },
];

/**
 * Pestañas de la carátula: son el menú del sitio. En celular se desplazan de
 * lado y la de la página actual queda a la vista al cargar.
 */
export function PestanasSitio({ actual }: { actual: SeccionSitio | null }) {
  const tira = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const contenedor = tira.current;
    const activa = contenedor?.querySelector<HTMLElement>("[aria-current=page]");
    if (!contenedor || !activa) return;
    const fuera = activa.offsetLeft + activa.offsetWidth - contenedor.clientWidth;
    if (fuera > 0) contenedor.scrollLeft = fuera + 24;
  }, [actual]);

  return (
    <nav aria-label="Secciones del sitio" className="px-3 sm:px-6 lg:px-8">
      <div ref={tira} className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SECCIONES.map((seccion) => {
          const activa = seccion.id === actual;
          return (
            <Link
              key={seccion.id}
              href={seccion.href}
              aria-current={activa ? "page" : undefined}
              className={cx(
                "relative flex min-h-12 shrink-0 items-center rounded-t-lg px-4 text-[15px] font-semibold transition-colors duration-150 sm:min-h-11",
                activa
                  ? "bg-sheet text-ink"
                  : "text-ink-2 hover:bg-[color-mix(in_srgb,var(--sheet)_50%,transparent)] hover:text-ink",
              )}
            >
              {activa && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-[2px] rounded-b bg-gold" />}
              {seccion.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
