"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, User, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string; description?: string };

const primaryLinks: NavLink[] = [
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
];

// "Nosotros" agrupa las páginas institucionales para que el menú quepa en una línea.
const aboutLinks: NavLink[] = [
  { href: "/quienes-somos", label: "Quiénes somos", description: "Trayectoria y forma de trabajo." },
  { href: "/filosofia", label: "Filosofía", description: "Cómo entendemos el ejercicio del derecho." },
  // Esta entrada pública sigue disponible sin importar el estado del SaaS.
  { href: "/gestion-procesos", label: "Gestión de procesos", description: "Plataforma para profesionales del derecho." },
];

const contactLink: NavLink = { href: "/contacto", label: "Contacto" };
// El menú móvil conserva la lista completa y plana del diseño anterior.
const mobileLinks: NavLink[] = [
  { href: "/", label: "Inicio" },
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
  { href: "/quienes-somos", label: "Quiénes somos" },
  { href: "/filosofia", label: "Filosofía" },
  { href: "/contacto", label: "Contacto" },
  { href: "/gestion-procesos", label: "Gestión de procesos" },
];
const CLIENT_PORTAL_HREF = "/gestion-procesos/auth/login";

const desktopLinkClass =
  "marketing-nav-link inline-flex h-10 items-center gap-1 whitespace-nowrap px-1 text-[15px] font-semibold transition-colors hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 rounded-sm";

export function SiteHeader() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const open = openPath === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const aboutActive = aboutLinks.some((link) => pathname === link.href);

  useEffect(() => {
    if (!open && !aboutOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (open) {
        setOpenPath(null);
        menuButtonRef.current?.focus();
      }
      setAboutOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (aboutRef.current && !aboutRef.current.contains(event.target as Node)) setAboutOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, aboutOpen]);

  const linkTone = (active: boolean) => (active ? "text-brand-900" : "text-brand-950/70");

  return (
    <header className="sticky top-0 z-50 border-b border-brand-950/[0.08] bg-[#fafaf9]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:h-[72px] lg:px-8">
        <Link
          href="/"
          aria-label="Alejandra Muñoz, inicio"
          className="relative block h-12 w-48 shrink-0 transition-opacity hover:opacity-90 lg:h-11 lg:w-52"
        >
          <Image
            src="/AM_logo_Recurso 2_Landscape_web.svg"
            alt="Alejandra Muñoz Abogada y Asociados"
            fill
            priority
            className="object-contain object-left"
          />
        </Link>

        <nav aria-label="Navegación principal" className="ml-auto hidden items-center gap-6 lg:flex xl:gap-8">
          {primaryLinks.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`${desktopLinkClass} ${linkTone(active)}`}>
                {link.label}
              </Link>
            );
          })}

          <div ref={aboutRef} className="relative">
            <button
              type="button"
              aria-expanded={aboutOpen}
              aria-controls="marketing-about-menu"
              onClick={() => setAboutOpen((value) => !value)}
              className={`${desktopLinkClass} ${linkTone(aboutActive)}`}
              aria-current={aboutActive ? "page" : undefined}
            >
              Nosotros
              <ChevronDown className={`size-4 transition-transform ${aboutOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {aboutOpen && (
              <div
                id="marketing-about-menu"
                className="marketing-menu-enter absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 rounded-2xl border border-brand-950/10 bg-white p-2 shadow-[0_18px_40px_-12px_rgba(0,20,61,0.25)]"
              >
                {aboutLinks.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setAboutOpen(false)}
                      className={`block rounded-xl px-3.5 py-3 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ${active ? "bg-brand-50" : ""}`}
                    >
                      <span className="block text-sm font-semibold text-brand-950">{link.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-brand-950/60">{link.description}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <Link
            href={contactLink.href}
            aria-current={pathname === contactLink.href ? "page" : undefined}
            className={`${desktopLinkClass} ${linkTone(pathname === contactLink.href)}`}
          >
            {contactLink.label}
          </Link>
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:ml-2 lg:flex">
          <Link
            href={CLIENT_PORTAL_HREF}
            aria-label="Portal de clientes"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-[15px] font-semibold text-brand-900 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
          >
            <UserRound className="size-[18px]" aria-hidden="true" />
            <span className="hidden xl:inline">Portal de clientes</span>
          </Link>
          <Link
            href="/contacto"
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-brand-900 px-5 text-[15px] font-semibold !text-white transition-colors hover:bg-brand-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
          >
            Agendar asesoría
            <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
          </Link>
        </div>

        {/* Mobile menu trigger */}
        <button
          ref={menuButtonRef}
          type="button"
          className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-border/60 text-brand-950 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 ml-auto lg:hidden"
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
            {mobileLinks.map((link) => {
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
