import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Carpeta, Columna, Ficha, RELLENO, TituloHoja, TituloPagina } from "@/components/sitio/Caratula";
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
        </div>
      </Carpeta>

      {/* El equipo va en su propio bloque, fuera de la hoja: solo el título y las tarjetas. */}
      {contenido.team.length > 0 && (
        <Columna className="mt-10 sm:mt-14">
          <section aria-labelledby="equipo">
            <TituloHoja id="equipo">{enLinea(contenido.teamTitle)}</TituloHoja>
            <ul className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {contenido.team.map((persona) => <TarjetaEquipo key={persona.name} persona={persona} />)}
            </ul>
          </section>
        </Columna>
      )}
    </MarcoSitio>
  );
}

type Persona = { name: string; role: string; license: string; photo: string; profile: string; experience: string };

/**
 * Tarjeta de una persona del equipo. Cerrada muestra la foto, el nombre y el
 * título; al abrirla, el perfil, la trayectoria y la tarjeta profesional.
 * Lo que la administración deja vacío no se muestra.
 */
function TarjetaEquipo({ persona }: { persona: Persona }) {
  const iniciales = persona.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("");
  const hayDetalle = Boolean(persona.profile || persona.experience || persona.license);
  const cabeza = (
    <>
      <div className="caratula-azul relative aspect-[4/3] w-full max-w-full overflow-hidden">
        {persona.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={persona.photo} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-display text-[56px] text-[var(--on-cover-2)]">{iniciales}</span>
        )}
      </div>
      <div className="flex items-end justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-[21px] leading-[1.25] text-ink">{persona.name}</h3>
          {persona.role && <p className="mt-1 text-[15px] font-semibold text-navy">{persona.role}</p>}
        </div>
        {hayDetalle && (
          <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-ink-2">
            <span className="group-open:hidden">Ver perfil</span>
            <span className="hidden group-open:inline">Cerrar</span>
            <ChevronDown aria-hidden="true" size={18} strokeWidth={2} className="transition-transform duration-200 group-open:rotate-180" />
          </span>
        )}
      </div>
    </>
  );

  return (
    <li className="overflow-hidden rounded-xl bg-sheet shadow-sheet">
      {hayDetalle ? (
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{cabeza}</summary>
          <div className="space-y-4 border-t border-line px-5 pt-4 pb-5">
            {persona.profile && (
              <div>
                <h4 className="text-[14px] font-semibold text-ink-2">Perfil profesional</h4>
                <p className="mt-1.5 text-[16px] leading-[1.6] text-ink">{enLinea(persona.profile)}</p>
              </div>
            )}
            {persona.experience && (
              <div>
                <h4 className="text-[14px] font-semibold text-ink-2">Trayectoria</h4>
                <Texto valor={persona.experience} className="mt-1.5 text-[16px]" />
              </div>
            )}
            {persona.license && <p className="folio-num text-[15px] text-ink-2">{persona.license}</p>}
          </div>
        </details>
      ) : (
        cabeza
      )}
    </li>
  );
}
