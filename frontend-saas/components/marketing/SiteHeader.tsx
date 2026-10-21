"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Menu, User, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
  { href: "/quienes-somos", label: "Quiénes somos" },
  { href: "/filosofia", label: "Filosofía" },
  { href: "/contacto", label: "Contacto" },
  // This public entry stays available regardless of the SaaS launch state.
  { href: "/gestion-procesos", label: "Gestión de procesos" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenPath(null);
      menuButtonRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-surface/95 backdrop-blur-md shadow-xs transition-colors">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2.5 lg:px-8">
        {/* Logo */}
        <Link href="/" aria-label="Alejandra Muñoz, inicio" className="relative block h-12 w-48 sm:h-14 sm:w-64 transition-opacity hover:opacity-95">
          <Image
            src="/AM_logo_Recurso 2_Landscape_web.svg"
            alt="Alejandra Muñoz Abogada y Asociados"
            fill
            priority
            className="object-contain object-left"
          />
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Navegación principal" className="hidden items-center gap-5 xl:gap-7 text-xs xl:text-sm font-semibold text-brand-950 lg:flex">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`marketing-nav-link inline-flex min-h-11 items-center transition-colors hover:text-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ${
                  isActive ? "text-brand-900 font-bold" : "text-brand-950/75"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Action CTAs */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/gestion-procesos/auth/login"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs xl:text-sm font-semibold text-brand-900 transition-colors hover:bg-surface-hover hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
          >
            <User className="size-3.5 text-brand-700" aria-hidden="true" />
            Soy cliente
          </Link>
          <Link
            href="/contacto"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand-900 px-4 py-2 text-xs xl:text-sm font-semibold !text-white transition-all hover:bg-brand-950 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            Agendar asesoría
            <ArrowRight className="size-3.5 text-gold-300" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          ref={menuButtonRef}
          type="button"
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-border/60 text-brand-950 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 lg:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-controls="marketing-mobile-menu"
          aria-expanded={open}
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <nav
          id="marketing-mobile-menu"
          aria-label="Navegación principal móvil"
          className="marketing-menu-enter border-t border-border bg-surface px-5 py-4 shadow-lg lg:hidden"
        >
          <div className="space-y-1">
            {links.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setOpenPath(null)}
                  className={`flex min-h-11 items-center rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "border-l-4 border-gold-400 bg-gold-400/10 text-brand-900 font-bold"
                      : "text-foreground-secondary hover:bg-surface-hover hover:text-brand-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <Link
              href="/contacto"
              onClick={() => setOpenPath(null)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 py-3 text-center text-sm font-bold !text-white transition hover:bg-brand-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              Agendar asesoría jurídica
              <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
            </Link>
            <Link
              href="/gestion-procesos/auth/login"
              onClick={() => setOpenPath(null)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-center text-sm font-semibold text-brand-900 transition hover:bg-surface-hover"
            >
              <User className="size-4 text-brand-700" aria-hidden="true" />
              Ingreso a portal de clientes
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
