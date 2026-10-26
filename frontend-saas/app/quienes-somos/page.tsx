import { renderRichText } from "@/components/marketing/RichText";
import { MarketingContactCta } from "@/components/marketing/MarketingContactCta";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";
import { CheckCircle2, ShieldCheck } from "lucide-react";

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
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
            {renderRichText(content.eyebrow)}
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
            {renderRichText(content.title)}
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed text-foreground-muted">
            {renderRichText(content.intro)}
          </p>
        </div>

        {/* Credentials Callout Card */}
        <div className="rounded-2xl border border-gold-400/30 bg-gold-400/10 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-brand-950 flex items-center gap-2">
              <ShieldCheck className="size-5 text-gold-600" aria-hidden="true" />
              Dirección Jurídica Titular
            </h2>
            <p className="text-sm text-foreground-muted">
              Yeinny Alejandra Muñoz Marín · T.P. 375.092 del Consejo Superior de la Judicatura.
            </p>
          </div>
          <span className="inline-flex rounded-xl bg-brand-900 px-4 py-2 text-xs font-bold text-white shrink-0">
            Sabaneta · Colombia
          </span>
        </div>

        {/* Content Sections */}
        <div className="grid gap-8 md:grid-cols-3">
          {content.sections.map((section, idx) => (
            <article
              key={section.title}
              className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-3"
            >
              <div className="flex items-center gap-2 text-gold-600 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span>Pilar 0{idx + 1}</span>
              </div>
              <h2 className="text-xl font-bold text-foreground">
                {renderRichText(section.title)}
              </h2>
              <p className="text-sm leading-relaxed text-foreground-muted">
                {renderRichText(section.body)}
              </p>
            </article>
          ))}
        </div>

        {/* Contact CTA */}
        <MarketingContactCta />
      </main>
    </MarketingLayout>
  );
}
