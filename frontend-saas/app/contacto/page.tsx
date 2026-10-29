import { ChevronDown } from "lucide-react";
import { areaDeConsulta } from "@/components/sitio/areas";
import { Carpeta, Entrada, Ficha, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { FormularioConsulta } from "@/components/sitio/FormularioConsulta";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { telefonoLegible } from "@/lib/sitio";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("contacto", SITE_PAGE_DEFAULTS.contacto, "/contacto");
}

export default async function Contacto({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [contenido, contacto, parametros] = await Promise.all([
    cargarPagina("contacto", SITE_PAGE_DEFAULTS.contacto),
    cargarContacto(),
    searchParams,
  ]);
  const whatsapp = contacto.mostrar_contacto ? contacto.whatsapp : null;
  const correo = contacto.mostrar_contacto ? contacto.correo_contacto : null;

  return (
    <MarcoSitio>
      <Carpeta
        actual="contacto"
        id="consulta"
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
              <Entrada>{enLinea(contenido.intro)}</Entrada>
            </div>
            <Ficha
              filas={[
                // El correo sale de la configuración de la firma, no del texto de la página, para no mostrar dos.
                ...contenido.contactOptions
                  .filter((opcion) => opcion.icon !== "email")
                  .map((opcion) => ({ etiqueta: opcion.title, valor: enLinea(opcion.description) })),
                ...(whatsapp ? [{ etiqueta: "WhatsApp", valor: telefonoLegible(whatsapp) }] : []),
                ...(correo ? [{ etiqueta: "Correo", valor: <CorreoPartible correo={correo} /> }] : []),
              ]}
            />
          </div>
        }
      >
        <div className={RELLENO}>
          <div className="max-w-[760px]">
            <FormularioConsulta
              key={String(parametros.area ?? "")}
              titulo="Escríbanos su consulta"
              intro="Cuéntenos en pocas palabras qué decisión tiene por delante. La firma lo lee y le responde por el medio que usted elija."
              areaInicial={areaDeConsulta(parametros.area)}
              whatsapp={whatsapp}
            />
          </div>
        </div>

        {contenido.faqs.length > 0 && (
          <section aria-label={contenido.faqEyebrow} className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
            <TituloHoja>{enLinea(contenido.faqEyebrow)}</TituloHoja>
            <div className="divide-y divide-line border-y border-line">
              {contenido.faqs.map((pregunta) => (
                <details key={pregunta.question} className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden hover:text-navy">
                    {pregunta.question}
                    <ChevronDown aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="max-w-[64ch] pb-5 text-[17px] leading-[1.65] text-ink-2">{enLinea(pregunta.answer)}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </Carpeta>
    </MarcoSitio>
  );
}

/** Si el correo no cabe, se parte después de la arroba y nunca en medio de una palabra. */
function CorreoPartible({ correo }: { correo: string }) {
  const [usuario, dominio] = correo.split("@");
  return dominio ? <>{usuario}@<wbr />{dominio}</> : <>{correo}</>;
}
