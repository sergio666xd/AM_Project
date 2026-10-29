import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Carpeta, Entrada, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("filosofia", SITE_PAGE_DEFAULTS.filosofia, "/filosofia");
}

export default async function Filosofia() {
  const contenido = await cargarPagina("filosofia", SITE_PAGE_DEFAULTS.filosofia);

  return (
    <MarcoSitio>
      <Carpeta
        actual="firma"
        caratula={
          <div>
            <Link href="/quienes-somos" className="mb-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink-2 hover:text-navy">
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={2} />
              Quiénes somos
            </Link>
            <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
            <Entrada>{enLinea(contenido.intro)}</Entrada>
          </div>
        }
      >
        <div className="divide-y divide-line">
          <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-3 md:gap-10`}>
            {contenido.values.map((valor) => (
              <div key={valor.title}>
                <h2 className="font-display text-[26px] leading-[1.2] text-ink">{valor.title}</h2>
                <p className="mt-2 text-[17px] leading-[1.6] text-ink-2">{enLinea(valor.description)}</p>
              </div>
            ))}
          </div>

          <section aria-labelledby="metodo" className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
            <div className="space-y-3">
              <TituloHoja id="metodo">{enLinea(contenido.methodologyTitle)}</TituloHoja>
              <p className="max-w-[44ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(contenido.methodologyDescription)}</p>
            </div>
            {/* Las etapas del acompañamiento, como la línea de etapas de un expediente. */}
            <ol className="space-y-7">
              {contenido.steps.map((paso, i) => (
                <li key={paso.title} className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-5 after:absolute after:top-10 after:-bottom-7 after:left-[19.5px] after:w-px after:bg-line-strong last:after:hidden">
                  <span className="folio-num relative z-[1] flex size-10 items-center justify-center rounded-full bg-sheet text-[18px] text-navy shadow-[0_0_0_1.5px_var(--navy)]">
                    {i + 1}
                  </span>
                  <div className="pt-1.5">
                    <h3 className="text-[18px] font-semibold text-ink">{paso.title}</h3>
                    <p className="mt-1.5 max-w-[56ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(paso.description)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}
