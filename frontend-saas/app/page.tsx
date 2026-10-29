import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { areaDeIcono } from "@/components/sitio/areas";
import { Carpeta, Entrada, Ficha, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { EtiquetaCaratula } from "@/components/sitio/Etiqueta";
import { FormularioConsulta } from "@/components/sitio/FormularioConsulta";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("inicio", SITE_PAGE_DEFAULTS.inicio, "/");
}

export default async function Inicio() {
  const [inicio, contacto] = await Promise.all([cargarPagina("inicio", SITE_PAGE_DEFAULTS.inicio), cargarContacto()]);
  return (
    <MarcoSitio>
      <Carpeta
        actual="consulta"
        id="consulta"
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-14">
            <div>
              <div className="mb-5 flex flex-wrap gap-2">
                {contacto.ciudad && <EtiquetaCaratula>{contacto.ciudad}</EtiquetaCaratula>}
                {/* En celular la entrada ya lo dice; así las etiquetas caben en una línea. */}
                <EtiquetaCaratula className="max-sm:hidden">Atención en toda Colombia</EtiquetaCaratula>
              </div>
              <TituloPagina grande>{enLinea(inicio.heroTitle)}</TituloPagina>
              <Entrada>{enLinea(inicio.heroDescription)}</Entrada>
            </div>
            <Ficha
              filas={[
                { etiqueta: "Atiende", valor: "Alejandra Muñoz Marín, abogada titular" },
                {
                  etiqueta: "Asuntos",
                  // Cada separador queda pegado al área anterior: ninguna línea empieza con "·".
                  valor: inicio.services.map((s, i, todos) => (
                    <Fragment key={s.title}>
                      <span className="whitespace-nowrap">{s.title}{i < todos.length - 1 ? " ·" : ""}</span>
                      {i < todos.length - 1 ? " " : ""}
                    </Fragment>
                  )),
                },
                { etiqueta: "Modalidad", valor: "Presencial en Sabaneta con cita previa, o virtual por Teams o Zoom" },
              ]}
            />
          </div>
        }
      >
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14`}>
          <FormularioConsulta
            titulo="¿Qué necesita resolver?"
            intro="Escríbanos en pocas palabras. La firma lo lee y le responde por el medio que usted elija."
            whatsapp={contacto.mostrar_contacto ? contacto.whatsapp : null}
          />
          <aside className="space-y-6 lg:border-l lg:border-line lg:pl-10">
            <blockquote className="font-display text-[22px] leading-[1.4] text-ink">{enLinea(inicio.heroAside)}</blockquote>
            {contacto.mostrar_contacto && contacto.correo_contacto && (
              <p className="text-[16px] leading-[1.55] text-ink-2">
                También puede escribirnos a{" "}
                <a href={`mailto:${contacto.correo_contacto}`} className="text-navy underline underline-offset-4 [overflow-wrap:anywhere]">{contacto.correo_contacto}</a>
              </p>
            )}
          </aside>
        </div>

        <section aria-label={inicio.servicesTitle}>
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
          <div className="space-y-5">
            <TituloHoja>{enLinea(inicio.servicesTitle)}</TituloHoja>
            <Link href="/areas-de-practica" className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-navy underline-offset-4 hover:underline">
              {inicio.servicesLink}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {inicio.services.map((servicio, i) => (
              <li key={servicio.title}>
                <Link
                  href={`/areas-de-practica#${areaDeIcono(servicio.icon, i).ancla}`}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 py-5 sm:py-6"
                >
                  <span>
                    <span className="block font-display text-[22px] leading-[1.25] text-ink group-hover:text-navy">{servicio.title}</span>
                    <span className="mt-1.5 block max-w-[60ch] text-[16px] leading-[1.55] text-ink-2">{servicio.description}</span>
                  </span>
                  <ArrowRight aria-hidden="true" size={20} strokeWidth={1.75} className="text-ink-3 transition-[translate,color] duration-200 group-hover:translate-x-1 group-hover:text-navy" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
        </section>

        <section aria-label={inicio.preventionTitle}>
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14`}>
          <div>
            <TituloHoja>{enLinea(inicio.preventionTitle)}</TituloHoja>
            <p className="mt-4 max-w-[60ch] text-[17px] leading-[1.65] text-ink-2">{enLinea(inicio.preventionDescription)}</p>
            <ul className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-x-8 border-t border-line sm:grid-cols-2">
              {inicio.preventionItems.map((item) => (
                <li key={item} className="border-b border-line py-3 text-[17px] text-ink">{item}</li>
              ))}
            </ul>
          </div>
          <div className="self-start lg:border-l lg:border-line lg:pl-10">
            <h2 className="font-display text-[24px] leading-[1.25] text-ink">{enLinea(inicio.aboutTitle)}</h2>
            <p className="mt-3 text-[17px] leading-[1.6] text-ink-2">{enLinea(inicio.aboutDescription)}</p>
            <Link href="/quienes-somos" className="mt-5 inline-flex items-center gap-1.5 text-[16px] font-semibold text-navy underline-offset-4 hover:underline">
              {inicio.aboutLink}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>
        </div>
        </section>
      </Carpeta>
    </MarcoSitio>
  );
}
