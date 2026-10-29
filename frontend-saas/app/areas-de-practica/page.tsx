import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { clasesBoton } from "@/components/ui/Button";
import { areaDeIcono } from "@/components/sitio/areas";
import { Carpeta, Entrada, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"], "/areas-de-practica");
}

export default async function AreasDePractica() {
  const contenido = await cargarPagina("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"]);
  const areas = contenido.areas.map((area, i) => ({ ...area, ...areaDeIcono(area.icon, i) }));

  return (
    <MarcoSitio>
      <Carpeta
        actual="areas"
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
              <Entrada>{enLinea(contenido.description)}</Entrada>
            </div>
            <nav aria-label="Áreas en esta página">
              <h2 className="mb-3 text-[14px] font-semibold text-ink-2">En esta página</h2>
              <ol className="divide-y divide-manila-line border-y border-manila-line">
                {areas.map((area) => (
                  <li key={area.ancla}>
                    <a href={`#${area.ancla}`} className="group flex items-center justify-between gap-4 py-3 text-[16px] text-ink">
                      <span className="group-hover:text-navy group-hover:underline group-hover:underline-offset-4">{area.title}</span>
                      <ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} className="rotate-90 text-ink-2 group-hover:text-navy" />
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        }
      >
        <div className="divide-y divide-line">
          {areas.map((area) => (
            <section key={area.ancla} id={area.ancla} aria-labelledby={`${area.ancla}-titulo`} className={`${RELLENO} scroll-mt-6`}>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14">
                <div className="space-y-4">
                  <TituloHoja id={`${area.ancla}-titulo`}>{area.title}</TituloHoja>
                  <p className="max-w-[46ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(area.description)}</p>
                  <Link href={`/contacto?area=${area.area}#consulta`} className={`${clasesBoton("secondary", "lg")} mt-2`}>
                    Consultar sobre este tema
                  </Link>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-8 sm:grid-cols-2">
                  {area.sections.map((seccion) => (
                    <div key={seccion.title}>
                      <h3 className="text-[17px] font-semibold text-ink">{seccion.title}</h3>
                      <ul className="mt-3 space-y-2 pl-5 text-[16px] leading-[1.5] text-ink-2 marker:text-ink-3 list-disc">
                        {seccion.items.map((item) => <li key={item} className="pl-1">{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
        <section aria-label={contenido.closingTitle}>
        <div className={`${RELLENO} flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="space-y-3">
            <TituloHoja>{enLinea(contenido.closingTitle)}</TituloHoja>
            <p className="max-w-[60ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(contenido.closingDescription)}</p>
          </div>
          <Link href="/contacto#consulta" className={`${clasesBoton("primary", "lg")} shrink-0`}>
            {contenido.closingCta}
          </Link>
        </div>
        </section>
      </Carpeta>
    </MarcoSitio>
  );
}
