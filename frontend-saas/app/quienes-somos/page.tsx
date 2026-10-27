import { renderRichText } from "@/components/marketing/RichText";
import { MarketingContactCta } from "@/components/marketing/MarketingContactCta";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("quienes-somos", SITE_PAGE_DEFAULTS["quienes-somos"], "/quienes-somos");
}

export default async function QuienesSomos() {
  const content = await loadPublicPageContent("quienes-somos", SITE_PAGE_DEFAULTS["quienes-somos"]);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-5xl px-5 py-12 lg:py-20 lg:px-8 space-y-16">
        {/* Header */}
        <div className="max-w-3xl space-y-4">
          {content.eyebrow.trim() && content.eyebrow.trim() !== content.title.trim() && (
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
              {renderRichText(content.eyebrow)}
            </span>
          )}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-medium tracking-[-0.01em] text-foreground">
            {renderRichText(content.title)}
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed text-foreground-muted">
            {renderRichText(content.intro)}
          </p>
        </div>

        {/* Secciones: textos largos, en bloques de lectura a todo el ancho */}
        <div className="divide-y divide-border border-y border-border">
          {content.sections.map((section) => (
            <section
              key={section.title}
              className="grid gap-4 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-12 lg:py-14"
            >
              <h2 className="font-display text-2xl font-medium tracking-[-0.01em] text-foreground sm:text-3xl md:sticky md:top-28 md:self-start">
                {renderRichText(section.title)}
              </h2>
              <div className="max-w-[68ch] space-y-4 text-base leading-relaxed text-foreground-muted sm:text-[17px]">
                {renderRichText(section.body)}
              </div>
            </section>
          ))}
        </div>

        {/* Contact CTA */}
        <MarketingContactCta />
      </main>
    </MarketingLayout>
  );
}
