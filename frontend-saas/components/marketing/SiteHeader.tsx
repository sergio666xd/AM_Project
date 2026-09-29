"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/quienes-somos", label: "Quiénes somos" },
  { href: "/filosofia", label: "Filosofía" },
  { href: "/contacto", label: "Contacto" },
  { href: "/gestion-procesos", label: "Gestión de procesos" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-[#ccb56b]/30 bg-[#fffdf8]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2 lg:px-8">
        <Link href="/" aria-label="Alejandra Muñoz, inicio" className="relative block h-14 w-52 sm:h-16 sm:w-72">
          <Image src="/AM_logo_Recurso 2_Landscape_web.svg" alt="Alejandra Muñoz Abogada y Asociados" fill priority className="object-contain object-left" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#002060] md:flex">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`marketing-nav-link py-2 transition-colors hover:text-[#a58e42] ${pathname === link.href ? "text-[#002060]" : "text-[#002060]/75"}`}>{link.label}</Link>)}
          <Link href="/gestion-procesos/auth/login" className="rounded-full bg-[#002060] px-4 py-2 !text-white transition hover:bg-[#00328f]">Soy cliente</Link>
        </nav>
        <button type="button" className="rounded-md p-2 text-[#002060] md:hidden" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && <nav className="marketing-menu-enter border-t border-[#ccb56b]/30 bg-[#fffdf8] px-5 py-3 md:hidden">
        {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={() => setOpen(false)} className={`block border-l-4 py-3 pl-3 font-semibold ${pathname === link.href ? "border-[#ccb56b] bg-[#ccb56b]/10 text-[#002060]" : "border-transparent text-[#002060]"}`}>{link.label}</Link>)}
        <Link href="/gestion-procesos/auth/login" onClick={() => setOpen(false)} className="mt-3 block rounded-lg bg-[#002060] px-4 py-3 text-center font-bold !text-white transition hover:bg-[#00328f]">Soy cliente</Link>
      </nav>}
    </header>
  );
}
