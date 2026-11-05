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
                { etiqueta: "Equipo", valor: "Abogados con más de 10 años de experiencia" },
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
          {contenido.team.length > 0 && (
            <section aria-labelledby="equipo" className={RELLENO}>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-14">
                <div className="space-y-3">
                  <TituloHoja id="equipo">{enLinea(contenido.teamTitle)}</TituloHoja>
                  <p className="max-w-[44ch] text-[17px] leading-[1.6] text-ink-2">{enLinea(contenido.teamIntro)}</p>
                </div>
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2">
                  {contenido.team.map((persona) => <TarjetaEquipo key={persona.name} persona={persona} />)}
                </ul>
              </div>
            </section>
          )}
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}

type Persona = { name: string; role: string; license: string; photo: string; profile: string; experience: string };

/** Ficha de una persona del equipo. Lo que la administración deja vacío no se muestra. */
function TarjetaEquipo({ persona }: { persona: Persona }) {
  const iniciales = persona.name.split(/\s+/).filter(Boolean).slice(0, 3).map((p) => p[0]).join("");
  return (
    <li className="rounded-lg border border-line bg-sheet p-5">
      <div className="flex items-center gap-4">
        {persona.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={persona.photo} alt="" className="size-16 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-manila font-display text-[20px] text-ink-2">{iniciales}</span>
        )}
        <div className="min-w-0">
          <h3 className="font-display text-[20px] leading-[1.25] text-ink">{persona.name}</h3>
          <p className="mt-1 text-[15px] text-ink-2">{[persona.role, persona.license].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {persona.profile && <p className="mt-4 text-[16px] leading-[1.6] text-ink-2">{enLinea(persona.profile)}</p>}
      {persona.experience && <Texto valor={persona.experience} className="mt-3 text-[16px]" />}
    </li>
  );
}
