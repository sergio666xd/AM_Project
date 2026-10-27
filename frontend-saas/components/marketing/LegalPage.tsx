import Link from "next/link";
import { MarketingLayout } from "./MarketingLayout";
import { renderRichText } from "@/components/marketing/RichText";
import { ArrowUp, BookOpen, ShieldCheck } from "lucide-react";

export type LegalSection = { title: string; body: string[] };

function sectionId(title: string, index: number) {
  const slug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `seccion-${index + 1}-${slug || "documento"}`;
}

export function LegalPage({
  title,
  updatedAt,
  sections,
}: {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}) {
  return (
    <MarketingLayout>
      <main id="inicio-documento" className="mx-auto max-w-4xl px-5 py-12 sm:py-16 lg:px-8 space-y-10">
        {/* Header */}
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gold-600">
            <ShieldCheck className="size-4 text-gold-500" aria-hidden="true" />
            Marco Legal y Cumplimiento Normativo
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-medium tracking-[-0.01em] text-foreground">
            {renderRichText(title)}
          </h1>
          <p className="text-xs text-foreground-muted">
            Última actualización: {renderRichText(updatedAt)}
          </p>
        </div>

        {/* Index Table of Contents */}
        {sections.length > 0 && (
          <nav
            aria-label={`Índice de ${title}`}
            className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-3"
          >
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BookOpen className="size-4 text-gold-500" aria-hidden="true" />
              Índice del documento
            </h2>
            <ol className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-xs">
              {sections.map((section, index) => (
                <li key={`${section.title}-${index}`}>
                  <a
                    href={`#${sectionId(section.title, index)}`}
                    className="inline-flex min-h-8 items-center text-foreground-secondary hover:text-brand-900 hover:underline transition-colors"
                  >
                    <span className="font-semibold text-gold-600 mr-1.5">{index + 1}.</span>
                    {renderRichText(section.title)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Legal Sections Body */}
        <div className="space-y-12">
          {sections.map((section, index) => (
            <section
              key={`${section.title}-${index}`}
              id={sectionId(section.title, index)}
              tabIndex={-1}
              className="scroll-mt-28 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 rounded-lg p-2"
            >
              <h2 className="text-xl sm:text-2xl font-display font-medium text-foreground">
                {renderRichText(section.title)}
              </h2>
              <div className="space-y-3">
                {section.body.map((paragraph, paragraphIndex) => (
                  <p
                    key={`${index}-${paragraphIndex}`}
                    className="text-sm sm:text-base leading-relaxed text-foreground-secondary font-normal"
                  >
                    {renderRichText(paragraph)}
                  </p>
                ))}
              </div>
              <div className="pt-2">
                <a
                  href="#inicio-documento"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-900 hover:text-gold-600 transition-colors"
                >
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                  Volver al inicio del documento
                </a>
              </div>
            </section>
          ))}
        </div>

        {/* Footer Note */}
        <div className="rounded-xl border border-border bg-surface-secondary/50 p-5 text-xs text-foreground-muted flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <span>¿Tiene dudas o inquietudes sobre este documento o sus datos?</span>
          <Link
            href="/contacto"
            className="font-bold text-brand-900 hover:text-gold-600 underline transition-colors shrink-0"
          >
            Comuníquese con la firma
          </Link>
        </div>
      </main>
    </MarketingLayout>
  );
}
