"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

import { cx } from "@/lib/cx";

/**
 * Marco común de las páginas de acceso: a la izquierda, en escritorio, la
 * carátula de la firma en azul; a la derecha, la hoja con el formulario.
 */
export function AuthShell({ lema, detalle, volver, children }: {
  /** Frase grande de la carátula (Georgia). */
  lema: string;
  detalle?: string;
  /** Enlace para regresar, arriba del formulario. */
  volver?: { href: string; texto: string };
  children: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-ground text-ink lg:grid lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-rail p-12 text-[#f4f1e8] lg:flex dark:border-r dark:border-line lg:flex-col lg:justify-between">
        <span aria-hidden="true" className="absolute -right-32 -top-24 size-96 rounded-full shadow-[0_0_0_1px_rgb(204_181_107/0.3)]" />
        <span aria-hidden="true" className="absolute -bottom-28 -left-24 size-80 rounded-full shadow-[0_0_0_1px_rgb(204_181_107/0.2)]" />
        <Image src="/AM_logo_Full_White.svg" alt="Alejandra Muñoz | Abogada y Asociados" width={245} height={82} className="relative h-auto w-48" priority />
        <div className="relative max-w-md">
          <p className="text-balance font-display text-[44px] leading-[1.1]">{lema}</p>
          {detalle && <p className="mt-5 text-pretty text-[17px] leading-relaxed text-[#c9d1e6]">{detalle}</p>}
        </div>
        <p className="relative text-[14px] text-[#c9d1e6]">Alejandra Muñoz | Abogada y Asociados</p>
      </aside>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between gap-4">
            <span className="lg:hidden">
              <Image src="/AM_logo_Full_Black.svg" alt="Alejandra Muñoz | Abogada y Asociados" width={180} height={60} className="h-auto w-32 dark:hidden" />
              <Image src="/AM_logo_Full_White.svg" alt="Alejandra Muñoz | Abogada y Asociados" width={180} height={60} className="hidden h-auto w-32 dark:block" />
            </span>
            {volver && (
              <Link href={volver.href} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[14px] font-semibold text-ink-2 hover:bg-manila hover:text-ink">
                <ArrowLeft aria-hidden size={16} /> {volver.texto}
              </Link>
            )}
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function TituloAcceso({ titulo, texto }: { titulo: string; texto?: ReactNode }) {
  return (
    <div>
      <h1 className="text-balance font-display text-[32px] leading-tight text-ink">{titulo}</h1>
      {texto && <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink-2">{texto}</p>}
    </div>
  );
}

export const CAMPO_ACCESO =
  "block min-h-12 w-full rounded-lg bg-sheet px-4 text-[16px] text-ink shadow-[0_0_0_1px_var(--line-strong)] placeholder:text-ink-3 focus:outline-none focus:shadow-[0_0_0_2px_var(--navy)] aria-[invalid=true]:shadow-[0_0_0_2px_var(--bad)]";

export function CampoContrasena({ id, etiqueta, valor, onCambio, autoComplete, ayuda, invalido }: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  autoComplete: "current-password" | "new-password";
  ayuda?: string;
  invalido?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-[14px] font-semibold text-ink">{etiqueta}</span>
      <span className="relative block">
        <input
          id={id}
          name={id}
          required
          minLength={autoComplete === "new-password" ? 8 : undefined}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-invalid={invalido || undefined}
          aria-describedby={ayuda ? `${id}-ayuda` : undefined}
          className={cx(CAMPO_ACCESO, "pr-14")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute right-0.5 top-0.5 grid size-11 place-items-center rounded-md text-ink-2 hover:bg-manila hover:text-ink focus-visible:outline-2 focus-visible:outline-navy"
        >
          {visible ? <EyeOff aria-hidden size={19} /> : <Eye aria-hidden size={19} />}
        </button>
      </span>
      {ayuda && <span id={`${id}-ayuda`} className="mt-1 block text-[13.5px] text-ink-3">{ayuda}</span>}
    </label>
  );
}

export function AvisoAcceso({ tono, children, id }: { tono: "error" | "ok"; children: ReactNode; id?: string }) {
  return (
    <div
      id={id}
      role={tono === "error" ? "alert" : "status"}
      className={cx("rounded-lg px-4 py-3 text-[14.5px] leading-relaxed", tono === "error" ? "bg-bad-soft text-bad" : "bg-ok-soft text-ok")}
    >
      {children}
    </div>
  );
}
