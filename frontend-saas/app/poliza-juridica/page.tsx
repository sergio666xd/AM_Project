import Link from "next/link";
import { clasesBoton } from "@/components/ui/Button";
import { Carpeta, Entrada, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";
import { enlaceWhatsapp } from "@/lib/whatsapp";

export function generateMetadata() {
  return generatePublicPageMetadata("poliza-juridica", SITE_PAGE_DEFAULTS["poliza-juridica"], "/poliza-juridica");
}

export default async function PolizaJuridica() {
  const [contenido, contacto] = await Promise.all([
    cargarPagina("poliza-juridica", SITE_PAGE_DEFAULTS["poliza-juridica"]),
    cargarContacto(),
  ]);
  const whatsapp = contacto.mostrar_contacto ? contacto.whatsapp : null;

  return (
    <MarcoSitio>
      <Carpeta
        actual="poliza"
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
              <Entrada>{enLinea(contenido.intro)}</Entrada>
            </div>
            <div className="self-end rounded-lg bg-[color-mix(in_srgb,var(--sheet)_55%,transparent)] p-5 sm:p-6">
              <h2 className="font-display text-[22px] leading-[1.3] text-ink">{enLinea(contenido.asideTitle)}</h2>
              <p className="mt-2 text-[16px] leading-[1.6] text-ink-2">{enLinea(contenido.asideDescription)}</p>
            </div>
          </div>
        }
      >
        <div className={RELLENO}>
          <TituloHoja>{enLinea(contenido.coverageTitle)}</TituloHoja>
          <p className="mt-3 max-w-[60ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(contenido.coverageDescription)}</p>
          <dl className="mt-8 grid grid-cols-[minmax(0,1fr)] border-t border-line sm:grid-cols-2">
            {contenido.benefits.map((beneficio, i) => (
              <div
                key={beneficio.title}
                className={`border-b border-line py-6 sm:pr-8 ${i % 2 === 1 ? "sm:border-l sm:pl-8" : ""}`}
              >
                <dt className="font-display text-[22px] leading-[1.25] text-ink">{beneficio.title}</dt>
                <dd className="m-0 mt-2 max-w-[48ch] text-[16px] leading-[1.6] text-ink-2">{enLinea(beneficio.description)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <section aria-label={contenido.closingTitle}>
        <div className={`${RELLENO} flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="space-y-3">
            <TituloHoja>{enLinea(contenido.closingTitle)}</TituloHoja>
            <p className="max-w-[60ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(contenido.closingDescription)}</p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <Link href="/contacto?area=poliza#consulta" className={clasesBoton("primary", "lg")}>
              {contenido.closingCta}
            </Link>
            {whatsapp && (
              <a href={enlaceWhatsapp(whatsapp, "Hola, quiero información sobre la póliza jurídica.")} target="_blank" rel="noreferrer" className={clasesBoton("secondary", "lg")}>
                Escribir por WhatsApp
              </a>
            )}
          </div>
        </div>
        </section>
      </Carpeta>
    </MarcoSitio>
  );
}
