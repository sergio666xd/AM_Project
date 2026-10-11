"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/quienes-somos", label: "Quiénes somos" },
  { href: "/filosofia", label: "Filosofía" },
  { href: "/contacto", label: "Contacto" },
  // This public entry stays available regardless of the SaaS launch state.
  { href: "/gestion-procesos", label: "Gestión de procesos" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
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
    <header className="sticky top-0 z-50 border-b border-[#ccb56b]/30 bg-[#fffdf8]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2 lg:px-8">
        <Link href="/" aria-label="Alejandra Muñoz, inicio" className="relative block h-14 w-52 sm:h-16 sm:w-72">
          <Image src="/AM_logo_Recurso 2_Landscape_web.svg" alt="Alejandra Muñoz Abogada y Asociados" fill priority className="object-contain object-left" />
        </Link>
        <nav aria-label="Navegación principal" className="hidden items-center gap-6 text-sm font-semibold text-[#002060] md:flex">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`marketing-nav-link inline-flex min-h-11 items-center transition-colors hover:text-[#a58e42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060] ${pathname === link.href ? "text-[#002060]" : "text-[#002060]/75"}`}>{link.label}</Link>)}
          <Link href="/gestion-procesos/auth/login" className="inline-flex min-h-11 items-center rounded-full bg-[#002060] px-4 !text-white transition hover:bg-[#00328f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Soy cliente</Link>
        </nav>
        <button ref={menuButtonRef} type="button" className="grid min-h-11 min-w-11 place-items-center rounded-md text-[#002060] hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060] md:hidden" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-controls="marketing-mobile-menu" aria-expanded={open} onClick={() => setOpenPath(open ? null : pathname)}>
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
      {open && <nav id="marketing-mobile-menu" aria-label="Navegación principal" className="marketing-menu-enter border-t border-[#ccb56b]/30 bg-[#fffdf8] px-5 py-3 md:hidden">
        {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpenPath(null)} className={`block min-h-11 border-l-4 py-3 pl-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060] ${pathname === link.href ? "border-[#ccb56b] bg-[#ccb56b]/10 text-[#002060]" : "border-transparent text-[#002060]"}`}>{link.label}</Link>)}
        <Link href="/gestion-procesos/auth/login" onClick={() => setOpenPath(null)} className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-[#002060] px-4 py-3 text-center font-bold !text-white transition hover:bg-[#00328f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Soy cliente</Link>
      </nav>}
    </header>
  );
}
