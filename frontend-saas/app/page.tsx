import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { clasesBoton } from "@/components/ui/Button";
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
              {/* Invitar a escribir no es pedir los datos: el formulario queda al final, después del contexto. */}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a href="#consulta" className={clasesBoton("primary", "lg")}>{inicio.heroCta}</a>
                <Link href="/servicios" className={clasesBoton("secondary", "lg")}>{inicio.heroSecondaryCta}</Link>
              </div>
            </div>
            <Ficha filas={inicio.trust.map((fila) => ({ etiqueta: fila.label, valor: enLinea(fila.value) }))} />
          </div>
        }
      >
        <section aria-label={inicio.servicesTitle}>
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
          <div className="space-y-5">
            <TituloHoja>{enLinea(inicio.servicesTitle)}</TituloHoja>
            <Link href="/servicios" className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-navy underline-offset-4 hover:underline">
              {inicio.servicesLink}
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
            </Link>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {inicio.services.map((servicio, i) => (
              <li key={servicio.title}>
                <Link
                  href={`/servicios#${areaDeIcono(servicio.icon, i).ancla}`}
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
        <section aria-labelledby="pasos" className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
          <TituloHoja id="pasos">{enLinea(inicio.stepsTitle)}</TituloHoja>
          <ol className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 sm:grid-cols-2">
            {inicio.steps.map((paso, i) => (
              <li key={paso.title} className="grid grid-cols-[40px_minmax(0,1fr)] gap-4">
                <span className="folio-num flex size-10 items-center justify-center rounded-full bg-sheet text-[18px] text-navy shadow-[0_0_0_1.5px_var(--navy)]">
                  {i + 1}
                </span>
                <div className="pt-1.5">
                  <h3 className="text-[18px] font-semibold text-ink">{paso.title}</h3>
                  <p className="mt-1.5 max-w-[48ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(paso.description)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="consulta" aria-label={inicio.formTitle} className="scroll-mt-6">
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14`}>
          <FormularioConsulta
            titulo={inicio.formTitle}
            intro={inicio.formIntro}
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
        </section>
      </Carpeta>
    </MarcoSitio>
  );
}
