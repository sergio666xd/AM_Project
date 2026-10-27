import { renderRichText } from "@/components/marketing/RichText";
import {
  ClipboardCheck,
  FileText,
  MessageCircle,
  Scale,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingContactCta } from "@/components/marketing/MarketingContactCta";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("poliza-juridica", SITE_PAGE_DEFAULTS["poliza-juridica"], "/poliza-juridica");
}

const whatsappUrl = "https://wa.me/573508809878?text=Hola%2C%20quiero%20conocer%20la%20P%C3%B3liza%20Jur%C3%ADdica%20y%20solicitar%20un%20estudio%20para%20mi%20caso.";

const benefitIcons = [MessageCircle, FileText, ShieldCheck, ClipboardCheck];

export default async function PolizaJuridicaPage() {
  const content = await loadPublicPageContent("poliza-juridica", SITE_PAGE_DEFAULTS["poliza-juridica"]);

  return (
    <MarketingLayout>
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 px-5 py-20 text-white lg:px-8 lg:py-28 border-b border-gold-400/20">
          <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-gold-300">
                <ShieldCheck className="size-4 text-gold-400" aria-hidden="true" />
                {renderRichText(content.eyebrow)}
              </span>
              <h1 className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-[-0.01em] text-white leading-[1.12]">
                {renderRichText(content.title)}
              </h1>
              <p className="max-w-2xl text-lg sm:text-xl leading-relaxed text-neutral-300">
                {renderRichText(content.intro)}
              </p>
              <div className="pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="marketing-cta inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-gold-400 px-6 py-3.5 text-sm font-bold text-brand-950 hover:bg-gold-300 transition-all shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  Solicitar estudio de la póliza
                </a>
              </div>
            </div>

            <aside className="rounded-3xl border border-gold-400/30 bg-white/5 p-8 sm:p-10 shadow-2xl backdrop-blur-md space-y-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-gold-400/20 text-gold-300">
                <Scale className="size-7" aria-hidden="true" />
              </span>
              <h2 className="text-xl sm:text-2xl font-display font-medium text-white">
                {renderRichText(content.asideTitle)}
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-neutral-300">
                {renderRichText(content.asideDescription)}
              </p>
            </aside>
          </div>
        </section>

        {/* Benefits Grid */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 space-y-12">
          <div className="max-w-3xl space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
              {renderRichText(content.coverageEyebrow)}
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-medium tracking-[-0.01em] text-foreground">
              {renderRichText(content.coverageTitle)}
            </h2>
            <p className="text-base leading-relaxed text-foreground-muted">
              {renderRichText(content.coverageDescription)}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index % benefitIcons.length];
              return (
                <article
                  key={benefit.title}
                  className="marketing-card rounded-2xl border border-border bg-surface p-6 shadow-xs hover:border-gold-400 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-900">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-foreground">
                      {renderRichText(benefit.title)}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                      {renderRichText(benefit.description)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Team & Assessment CTA Banner */}
        <section className="border-y border-border bg-surface-secondary px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[.8fr_1.2fr] md:items-center">
            <div className="grid size-28 place-items-center rounded-3xl bg-brand-50 text-brand-900 border border-brand-100 mx-auto">
              <UsersRound className="size-14 text-brand-900" aria-hidden="true" />
            </div>
            <div className="space-y-4">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
                {renderRichText(content.closingEyebrow)}
              </span>
              <h2 className="text-2xl sm:text-3xl font-display font-medium tracking-[-0.01em] text-foreground">
                {renderRichText(content.closingTitle)}
              </h2>
              <p className="text-base leading-relaxed text-foreground-muted">
                {renderRichText(content.closingDescription)}
              </p>
              <div className="pt-2">
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-950 transition-colors"
                >
                  <MessageCircle className="size-4 text-gold-300" aria-hidden="true" />
                  {renderRichText(content.closingCta)}
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <MarketingContactCta />
        </div>
      </main>
    </MarketingLayout>
  );
}
