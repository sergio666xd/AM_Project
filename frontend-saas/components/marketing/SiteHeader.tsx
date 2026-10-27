"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, Menu, UserRound, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string; description?: string };

const primaryLinks: NavLink[] = [
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
];

// "La firma" agrupa las páginas institucionales para que el menú quepa en una línea.
const firmLinks: NavLink[] = [
  { href: "/quienes-somos", label: "Quiénes somos", description: "Trayectoria y equipo de la firma." },
  { href: "/filosofia", label: "Filosofía", description: "Cómo entendemos el ejercicio del derecho." },
  // Esta entrada pública sigue disponible sin importar el estado del SaaS.
  { href: "/gestion-procesos", label: "Gestión de procesos", description: "Plataforma para profesionales del derecho." },
];

const contactLink: NavLink = { href: "/contacto", label: "Contacto" };
const CLIENT_PORTAL_HREF = "/gestion-procesos/auth/login";

const desktopLinkClass =
  "marketing-nav-link inline-flex h-10 items-center gap-1 whitespace-nowrap px-1 text-[15px] font-semibold transition-colors hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2 rounded-sm";

export function SiteHeader() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [firmOpen, setFirmOpen] = useState(false);
  const open = openPath === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firmRef = useRef<HTMLDivElement>(null);
  const firmActive = firmLinks.some((link) => pathname === link.href);

  useEffect(() => {
    if (!open && !firmOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (open) {
        setOpenPath(null);
        menuButtonRef.current?.focus();
      }
      setFirmOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (firmRef.current && !firmRef.current.contains(event.target as Node)) setFirmOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, firmOpen]);

  const linkTone = (active: boolean) => (active ? "text-brand-900" : "text-brand-950/70");

  return (
    <header className="sticky top-0 z-50 border-b border-brand-950/[0.08] bg-[#fafaf9]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:h-[72px] lg:px-8">
        <Link
          href="/"
          aria-label="Alejandra Muñoz, inicio"
          className="relative block h-10 w-44 shrink-0 transition-opacity hover:opacity-90 lg:h-11 lg:w-52"
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

          <div ref={firmRef} className="relative">
            <button
              type="button"
              aria-expanded={firmOpen}
              aria-controls="marketing-firm-menu"
              onClick={() => setFirmOpen((value) => !value)}
              className={`${desktopLinkClass} ${linkTone(firmActive)}`}
              aria-current={firmActive ? "page" : undefined}
            >
              La firma
              <ChevronDown className={`size-4 transition-transform ${firmOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {firmOpen && (
              <div
                id="marketing-firm-menu"
                className="marketing-menu-enter absolute left-1/2 top-full mt-3 w-72 -translate-x-1/2 rounded-2xl border border-brand-950/10 bg-white p-2 shadow-[0_18px_40px_-12px_rgba(0,20,61,0.25)]"
              >
                {firmLinks.map((link) => {
                  const active = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setFirmOpen(false)}
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

        <button
          ref={menuButtonRef}
          type="button"
          className="ml-auto grid size-11 place-items-center rounded-xl text-brand-950 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 lg:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-controls="marketing-mobile-menu"
          aria-expanded={open}
          onClick={() => setOpenPath(open ? null : pathname)}
        >
          {open ? <X className="size-6" aria-hidden="true" /> : <Menu className="size-6" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <nav
          id="marketing-mobile-menu"
          aria-label="Navegación principal móvil"
          className="marketing-menu-enter max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-brand-950/[0.08] bg-[#fafaf9] px-5 pb-6 pt-3 lg:hidden"
        >
          <ul className="divide-y divide-brand-950/[0.07]">
            {[{ href: "/", label: "Inicio" }, ...primaryLinks, contactLink].map((link) => (
              <MobileLink key={link.href} link={link} active={pathname === link.href} onNavigate={() => setOpenPath(null)} />
            ))}
          </ul>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-gold-600">La firma</p>
          <ul className="mt-1 divide-y divide-brand-950/[0.07]">
            {firmLinks.map((link) => (
              <MobileLink key={link.href} link={link} active={pathname === link.href} onNavigate={() => setOpenPath(null)} />
            ))}
          </ul>

          <div className="mt-6 grid gap-2.5">
            <Link
              href="/contacto"
              onClick={() => setOpenPath(null)}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-900 px-4 text-[15px] font-semibold !text-white transition hover:bg-brand-950"
            >
              Agendar asesoría
              <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
            </Link>
            <Link
              href={CLIENT_PORTAL_HREF}
              onClick={() => setOpenPath(null)}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-brand-950/15 bg-white px-4 text-[15px] font-semibold text-brand-900 transition hover:bg-brand-50"
            >
              <UserRound className="size-[18px]" aria-hidden="true" />
              Portal de clientes
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function MobileLink({ link, active, onNavigate }: { link: NavLink; active: boolean; onNavigate: () => void }) {
  return (
    <li>
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={`flex min-h-12 items-center justify-between py-2 text-base font-semibold transition-colors ${active ? "text-brand-900" : "text-brand-950/75 hover:text-brand-900"}`}
      >
        {link.label}
        {active && <span className="size-1.5 rounded-full bg-gold-400" aria-hidden="true" />}
      </Link>
    </li>
  );
}
