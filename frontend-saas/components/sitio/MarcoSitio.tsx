import Link from "next/link";
import type { ReactNode } from "react";
import { clasesBoton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { JsonLd } from "@/components/marketing/JsonLd";
import { telefonoLegible } from "@/lib/sitio";
import { cargarContacto } from "@/lib/sitioPublico";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { Columna } from "./Caratula";
import { EnlacePortal } from "./EnlacePortal";

const ENLACES_PIE = [
  { href: "/areas-de-practica", label: "Áreas de práctica" },
  { href: "/poliza-juridica", label: "Póliza jurídica" },
  { href: "/quienes-somos", label: "Quiénes somos" },
  { href: "/filosofia", label: "Nuestra filosofía" },
  { href: "/contacto", label: "Contacto" },
];

const ENLACES_LEGALES = [
  { href: "/politica-de-privacidad", label: "Política de privacidad" },
  { href: "/tratamiento-de-datos", label: "Tratamiento de datos personales" },
];

/**
 * Marco de todas las páginas públicas: encabezado blanco con el logo y el
 * acceso al portal de clientes, el escritorio manila y el pie azul.
 * La administración tiene su propia dirección y no se enlaza desde aquí.
 */
export async function MarcoSitio({ children }: { children: ReactNode }) {
  const contacto = await cargarContacto();
  const visible = contacto.mostrar_contacto;

  return (
    <div data-app className="flex min-h-dvh flex-col bg-ground text-ink lectura">
      <JsonLd />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sheet focus:px-3 focus:py-2 focus:shadow-pop">
        Ir al contenido
      </a>
      <header className="border-b border-line bg-sheet">
        <Columna className="flex min-h-[72px] items-center justify-between gap-4 py-3 sm:min-h-20">
          <Link href="/" aria-label="Inicio" className="-m-1 rounded-md p-1">
            <Logo className="h-10 w-auto sm:h-12" />
          </Link>
          <EnlacePortal className={clasesBoton("secondary", "md")}>
            Portal de clientes
          </EnlacePortal>
        </Columna>
      </header>

      <main id="contenido" className="flex-1 pb-12 sm:pb-16">{children}</main>

      <footer className="bg-navy text-on-navy">
        <Columna className="grid grid-cols-[minmax(0,1fr)] gap-10 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Logo variante="horizontal-inversa" className="h-11 w-auto" />
            <p className="max-w-[40ch] text-[15px] leading-[1.6] text-on-navy-2">
              {contacto.ciudad ? `${contacto.ciudad}. ` : ""}Atención presencial con cita y virtual para toda Colombia.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-[14px] font-semibold text-on-navy-2">Escríbanos</h2>
            {visible ? (
              <ul className="space-y-2 text-[16px]">
                {contacto.whatsapp && (
                  <li>
                    <a href={enlaceWhatsapp(contacto.whatsapp)} target="_blank" rel="noreferrer" className="underline decoration-on-navy-2/50 underline-offset-4 hover:decoration-on-navy">
                      WhatsApp {telefonoLegible(contacto.whatsapp)}
                    </a>
                  </li>
                )}
                {contacto.correo_contacto && (
                  <li>
                    <a href={`mailto:${contacto.correo_contacto}`} className="break-all underline decoration-on-navy-2/50 underline-offset-4 hover:decoration-on-navy">
                      {contacto.correo_contacto}
                    </a>
                  </li>
                )}
                {contacto.direccion && <li className="text-on-navy-2">{contacto.direccion}</li>}
              </ul>
            ) : (
              <p className="text-[16px]">
                <Link href="/contacto" className="underline underline-offset-4">Déjenos un mensaje</Link>
              </p>
            )}
          </div>

          <nav aria-label="Más del sitio" className="space-y-3">
            <h2 className="text-[14px] font-semibold text-on-navy-2">El sitio</h2>
            <ul className="space-y-2 text-[16px]">
              {ENLACES_PIE.map((enlace) => (
                <li key={enlace.href}>
                  <Link href={enlace.href} className="hover:underline hover:underline-offset-4">{enlace.label}</Link>
                </li>
              ))}
              <li>
                <EnlacePortal className="hover:underline hover:underline-offset-4">Portal de clientes</EnlacePortal>
              </li>
            </ul>
          </nav>
        </Columna>
        <div className="border-t border-white/10">
          <Columna className="flex flex-col gap-3 py-5 text-[14px] text-on-navy-2 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} {contacto.nombre}</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {ENLACES_LEGALES.map((enlace) => (
                <li key={enlace.href}>
                  <Link href={enlace.href} className="hover:text-on-navy hover:underline hover:underline-offset-4">{enlace.label}</Link>
                </li>
              ))}
            </ul>
          </Columna>
        </div>
      </footer>
    </div>
  );
}
