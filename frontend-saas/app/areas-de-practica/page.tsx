import Link from "next/link";
import { renderRichText } from "@/components/marketing/RichText";
import { MessageCircle } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PracticeAreasExplorer } from "@/components/marketing/PracticeAreasExplorer";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"], "/areas-de-practica");
}

export default async function AreasDePractica() {
  const content = await loadPublicPageContent("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"]);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-7xl px-5 py-12 lg:py-16 lg:px-8 space-y-12">
        {/* Header */}
        <div className="max-w-3xl space-y-3">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
            {renderRichText(content.eyebrow)}
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-medium tracking-[-0.01em] text-foreground">
            {renderRichText(content.title)}
          </h1>
          <p className="text-base sm:text-lg leading-relaxed text-foreground-muted">
            {renderRichText(content.description)}
          </p>
        </div>

        {/* Interactive Areas Explorer */}
        <PracticeAreasExplorer areas={content.areas} />

        {/* Closing Banner */}
        <section className="rounded-3xl border border-gold-400/30 bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 p-8 sm:p-12 text-center text-white shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-display font-medium tracking-[-0.01em] text-white">
            {renderRichText(content.closingTitle)}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-neutral-300 leading-relaxed">
            {renderRichText(content.closingDescription)}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3.5 sm:flex-row">
            <a
              href="https://wa.me/573508809878?text=Hola%2C%20quisiera%20asesor%C3%ADa%20en%20una%20de%20sus%20%C3%A1reas%20de%20pr%C3%A1ctica."
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 py-3 text-sm font-bold text-brand-950 hover:bg-gold-300 transition-colors shadow-sm"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {renderRichText(content.closingCta)}
            </a>
            <Link
              href="/contacto"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold !text-white backdrop-blur-xs hover:bg-white/10 transition-colors"
            >
              Más formas de contacto y formulario
            </Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
