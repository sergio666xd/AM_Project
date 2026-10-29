import Link from "next/link";
import { Carpeta, RELLENO, TituloPagina } from "./Caratula";
import { MarcoSitio } from "./MarcoSitio";
import { Texto, enLinea } from "./Texto";

type Seccion = { title: string; body: readonly string[] | string };

function ancla(titulo: string, indice: number) {
  const slug = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${indice + 1}-${slug || "seccion"}`;
}

/** Política de privacidad y de tratamiento de datos: índice numerado y secciones para citar por número. */
export function DocumentoLegal({
  titulo,
  actualizada,
  secciones,
  otro,
}: {
  titulo: string;
  actualizada: string;
  secciones: readonly Seccion[];
  otro: { href: string; label: string };
}) {
  const conAncla = secciones.map((seccion, i) => ({ ...seccion, id: ancla(seccion.title, i) }));
  return (
    <MarcoSitio>
      <Carpeta
        actual={null}
        caratula={
          <div>
            <TituloPagina>{enLinea(titulo)}</TituloPagina>
            <p className="mt-4 text-[17px] text-ink-2">
              Actualizada el {actualizada}. Vea también la{" "}
              <Link href={otro.href} className="text-navy underline underline-offset-4">{otro.label.toLowerCase()}</Link>.
            </p>
          </div>
        }
      >
        <div className={`${RELLENO} grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14`}>
          <nav aria-label="Secciones del documento" className="lg:sticky lg:top-6 lg:self-start">
            <h2 className="mb-3 text-[14px] font-semibold text-ink-2">Contenido</h2>
            <ol className="space-y-2 text-[16px]">
              {conAncla.map((seccion, i) => (
                <li key={seccion.id} className="grid grid-cols-[24px_minmax(0,1fr)]">
                  <span className="folio-num text-ink-3">{i + 1}.</span>
                  <a href={`#${seccion.id}`} className="text-ink hover:text-navy hover:underline hover:underline-offset-4">{seccion.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="max-w-[68ch] space-y-10">
            {conAncla.map((seccion, i) => (
              <section key={seccion.id} id={seccion.id} aria-labelledby={`${seccion.id}-t`} className="scroll-mt-6">
                <h2 id={`${seccion.id}-t`} className="font-display text-[24px] leading-[1.25] text-ink">
                  <span className="folio-num mr-2 text-ink-3">{i + 1}.</span>
                  {seccion.title}
                </h2>
                <Texto valor={typeof seccion.body === "string" ? seccion.body : seccion.body.join("\n\n")} className="mt-3" />
              </section>
            ))}
          </div>
        </div>
      </Carpeta>
    </MarcoSitio>
  );
}
