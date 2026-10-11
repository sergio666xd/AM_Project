import Link from "next/link";
import { MarketingLayout } from "./MarketingLayout";
import { renderRichText } from "@/components/marketing/RichText";

export type LegalSection = { title: string; body: string[] };

function sectionId(title: string, index: number) {
  const slug = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `seccion-${index + 1}-${slug || "documento"}`;
}

export function LegalPage({ title, updatedAt, sections }: { title: string; updatedAt: string; sections: LegalSection[] }) {
  return <MarketingLayout><main id="inicio-documento" className="mx-auto max-w-4xl px-5 py-12 sm:py-16 lg:px-8">
    <p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">Información legal</p>
    <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{renderRichText(title)}</h1>
    <p className="mt-4 text-sm text-[#334155]">Última actualización: {renderRichText(updatedAt)}</p>

    {sections.length > 0 && <nav aria-label={`Índice de ${title}`} className="mt-8 rounded-xl border border-[#ccb56b]/50 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Contenido de este documento</h2>
      <ol className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {sections.map((section, index) => <li key={`${section.title}-${index}`}>
          <a href={`#${sectionId(section.title, index)}`} className="inline-flex min-h-11 items-center rounded px-2 text-sm font-medium text-[#002060] underline decoration-[#92792e] underline-offset-4 hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">
            {renderRichText(section.title)}
          </a>
        </li>)}
      </ol>
    </nav>}

    <div className="mt-10 space-y-10">
      {sections.map((section, index) => <section key={`${section.title}-${index}`} id={sectionId(section.title, index)} tabIndex={-1} className="scroll-mt-28 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">
        <h2 className="text-2xl font-bold">{renderRichText(section.title)}</h2>
        {section.body.map((paragraph, paragraphIndex) => <p key={`${index}-${paragraphIndex}`} className="mt-3 leading-8 text-[#334155]">{renderRichText(paragraph)}</p>)}
        <a href="#inicio-documento" className="mt-4 inline-flex min-h-11 items-center rounded px-2 text-sm font-semibold text-[#002060] underline decoration-[#92792e] underline-offset-4 hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">Volver al inicio del documento</a>
      </section>)}
    </div>
    <p className="mt-10 border-t border-[#ccb56b]/40 pt-5 text-sm text-[#334155]">¿Tienes preguntas sobre este documento? <Link href="/contacto" className="inline-flex min-h-11 items-center font-semibold text-[#002060] underline decoration-[#92792e] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">Comunícate con la firma</Link>.</p>
  </main></MarketingLayout>;
}
