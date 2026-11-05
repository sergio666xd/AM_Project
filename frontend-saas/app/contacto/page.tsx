import { ArrowRight, ChevronDown, Mail, MapPin, MessageCircle, Video } from "lucide-react";
import { areaDeConsulta } from "@/components/sitio/areas";
import { Carpeta, Entrada, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { FormularioConsulta } from "@/components/sitio/FormularioConsulta";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { telefonoLegible } from "@/lib/sitio";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";
import { enlaceWhatsapp } from "@/lib/whatsapp";
import { cx } from "@/lib/cx";

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

  const lugar = contacto.direccion || contacto.ciudad;
  const iconos: Record<string, MedioContacto["icono"]> = { location: MapPin, clock: Video };
  const medios: MedioContacto[] = [
    // El correo sale de la configuración de la firma, no del texto de la página, para no mostrar dos.
    ...contenido.contactOptions
      .filter((opcion) => opcion.icon !== "email")
      .map((opcion) =>
        opcion.icon === "location" && lugar
          ? { icono: MapPin, etiqueta: opcion.title, valor: opcion.description, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`, accion: "Ver en el mapa", externo: true }
          : { icono: iconos[opcion.icon] ?? Video, etiqueta: opcion.title, valor: opcion.description, href: "#consulta", accion: "Agendar por el formulario" },
      ),
    ...(whatsapp
      ? [{ icono: MessageCircle, etiqueta: "WhatsApp", valor: telefonoLegible(whatsapp), href: enlaceWhatsapp(whatsapp), accion: "Escribir por WhatsApp", externo: true }]
      : []),
    ...(correo ? [{ icono: Mail, etiqueta: "Correo", valor: correo, href: `mailto:${correo}`, accion: "Enviar un correo" }] : []),
  ];

  return (
    <MarcoSitio>
      <Carpeta
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-12">
            <div className="lg:sticky lg:top-28">
              <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
              <Entrada>{enLinea(contenido.intro)}</Entrada>
              {/* En pantallas angostas los medios bajan a la hoja, debajo del formulario. */}
              <ListaMedios medios={medios} className="mt-9 max-lg:hidden" />
            </div>
            {/* La página es el formulario: va en la carátula, sobre una hoja blanca. */}
            <div id="consulta" className="hoja-clara scroll-mt-28 rounded-xl bg-sheet p-5 shadow-pop sm:p-8">
              <FormularioConsulta
                key={String(parametros.area ?? "")}
                titulo={contenido.formTitle}
                intro={contenido.formIntro}
                areaInicial={areaDeConsulta(parametros.area)}
                whatsapp={whatsapp}
              />
            </div>
          </div>
        }
      >
        <div className={`${RELLENO} lg:hidden`}>
          <ListaMedios medios={medios} />
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

type MedioContacto = {
  icono: typeof Mail;
  etiqueta: string;
  valor: string;
  href: string;
  accion: string;
  externo?: boolean;
};

/** Medios de contacto en una sola columna; cada uno es un enlace completo. */
function ListaMedios({ medios, className }: { medios: MedioContacto[]; className?: string }) {
  return (
    <ul className={cx("space-y-2", className)}>
      {medios.map(({ icono: Icono, etiqueta, valor, href, accion, externo }) => (
        <li key={etiqueta}>
          <a
            href={href}
            {...(externo ? { target: "_blank", rel: "noreferrer" } : {})}
            className="group -mx-3 grid grid-cols-[40px_minmax(0,1fr)] gap-4 rounded-lg px-3 py-3 transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--navy)_10%,transparent)]"
          >
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--navy)_14%,transparent)] text-navy">
              <Icono size={18} strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink-2">{etiqueta}</span>
              <span className="mt-0.5 block text-[16px] leading-[1.5] text-ink [overflow-wrap:break-word]">
                {/* Un correo largo se parte después de la arroba, nunca en medio del dominio. */}
                {valor.includes("@") ? <>{valor.split("@")[0]}@<wbr />{valor.split("@")[1]}</> : enLinea(valor)}
              </span>
              <span className="mt-1 inline-flex items-center gap-1 text-[15px] font-semibold text-navy">
                {accion}
                <ArrowRight aria-hidden="true" size={15} strokeWidth={2} className="transition-transform duration-200 group-hover:translate-x-1" />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
