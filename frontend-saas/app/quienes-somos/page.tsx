import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Carpeta, Ficha, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
import { MarcoSitio } from "@/components/sitio/MarcoSitio";
import { Texto, enLinea } from "@/components/sitio/Texto";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { cargarContacto, cargarPagina } from "@/lib/sitioPublico";

export function generateMetadata() {
  return generatePublicPageMetadata("quienes-somos", SITE_PAGE_DEFAULTS["quienes-somos"], "/quienes-somos");
}

export default async function QuienesSomos() {
  const [contenido, contacto] = await Promise.all([
    cargarPagina("quienes-somos", SITE_PAGE_DEFAULTS["quienes-somos"]),
    cargarContacto(),
  ]);

  const [primera, ...demas] = contenido.intro.trimStart().split("\n");
  const frase = primera?.match(/^\s*>\s?(.+)$/)?.[1] ?? null;
  const resto = frase ? demas.join("\n") : contenido.intro;

  return (
    <MarcoSitio>
      <Carpeta
        actual="firma"
        caratula={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end lg:gap-14">
            <div>
              <TituloPagina>{enLinea(contenido.title)}</TituloPagina>
              <Link href="/filosofia" className="mt-5 inline-flex items-center gap-1.5 text-[16px] font-semibold text-navy underline-offset-4 hover:underline">
                Nuestra filosofía de trabajo
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2} />
              </Link>
            </div>
            <Ficha
              filas={[
                { etiqueta: "Abogada titular", valor: "Alejandra Muñoz Marín" },
                ...(contacto.ciudad ? [{ etiqueta: "Sede", valor: contacto.ciudad }] : []),
              ]}
            />
          </div>
        }
      >
        <div className="divide-y divide-line">
          <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14`}>
            {/* Si el texto abre con una frase destacada ("> …"), va a la izquierda como en las secciones. */}
            {frase ? <TituloHoja>{enLinea(frase)}</TituloHoja> : <span aria-hidden="true" />}
            <Texto valor={resto} />
          </div>
          {contenido.sections.map((seccion) => (
            <section key={seccion.title} aria-label={seccion.title} className={RELLENO}>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14">
                <TituloHoja>{enLinea(seccion.title)}</TituloHoja>
                <Texto valor={seccion.body} />
              </div>
            </section>
          ))}
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}
