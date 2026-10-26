import { renderRichText } from "@/components/marketing/RichText";
import { MarketingContactCta } from "@/components/marketing/MarketingContactCta";
import { Compass, FileCheck2, Search, UserCheck, type LucideIcon } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("filosofia", SITE_PAGE_DEFAULTS.filosofia, "/filosofia");
}

const stepIcons: LucideIcon[] = [Search, Compass, FileCheck2, UserCheck];

export default async function Filosofia() {
  const content = await loadPublicPageContent("filosofia", SITE_PAGE_DEFAULTS.filosofia);

  return (
    <MarketingLayout>
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 px-5 py-20 text-white lg:px-8 lg:py-28 border-b border-gold-400/20">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl space-y-4">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-400">
                {renderRichText(content.eyebrow)}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
                {renderRichText(content.title)}
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed text-neutral-300">
                {renderRichText(content.intro)}
              </p>
            </div>

            <div className="mt-16 grid gap-8 sm:grid-cols-3">
              {content.values.map((value) => (
                <div key={value.number} className="border-t border-gold-400/40 pt-6 space-y-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-gold-400">
                    {renderRichText(value.number)}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    {renderRichText(value.title)}
                  </h2>
                  <p className="text-sm leading-relaxed text-neutral-300">
                    {renderRichText(value.description)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Methodology / Steps */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 space-y-12">
          <div className="mx-auto max-w-2xl text-center space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
              {renderRichText(content.methodologyEyebrow)}
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              {renderRichText(content.methodologyTitle)}
            </h2>
            <p className="text-base text-foreground-muted">
              {renderRichText(content.methodologyDescription)}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.steps.map((step, index) => {
              const Icon = stepIcons[index % stepIcons.length];
              return (
                <article
                  key={step.step}
                  className="marketing-card rounded-2xl border border-border bg-surface p-6 shadow-xs hover:border-gold-400 hover:shadow-md transition-all space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-900 font-bold text-xs">
                      <Icon className="size-5 text-brand-900" aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-gold-400/15 px-2.5 py-0.5 text-xs font-bold text-gold-700">
                      {renderRichText(step.step)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-foreground">
                    {renderRichText(step.title)}
                  </h3>
                  <p className="text-xs leading-relaxed text-foreground-muted">
                    {renderRichText(step.description)}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Contact CTA */}
        <div className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <MarketingContactCta />
        </div>
      </main>
    </MarketingLayout>
  );
}
