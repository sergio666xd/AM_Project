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
        <section className="bg-[#002060] px-5 py-20 text-white lg:px-8 lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[.2em] text-[#ccb56b]">
                <ShieldCheck size={17} /> {renderRichText(content.eyebrow)}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-tight sm:text-6xl">
                {renderRichText(content.title)}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/80">
                {renderRichText(content.intro)}
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#ccb56b] px-6 py-3.5 font-bold text-[#002060] transition hover:bg-[#dcc982]"
              >
                <MessageCircle size={20} /> Solicitar estudio de la póliza
              </a>
            </div>

            <aside className="rounded-3xl border border-[#ccb56b]/60 bg-white/10 p-8 sm:p-10">
              <Scale className="text-[#ccb56b]" size={36} />
              <h2 className="mt-5 text-2xl font-semibold">{renderRichText(content.asideTitle)}</h2>
              <p className="mt-4 leading-7 text-white/80">
                {renderRichText(content.asideDescription)}
              </p>
            </aside>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.coverageEyebrow)}</p>
            <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{renderRichText(content.coverageTitle)}</h2>
            <p className="mt-4 leading-7 text-[#002060]/75">{renderRichText(content.coverageDescription)}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {content.benefits.map((benefit, index) => {
              const Icon = benefitIcons[index % benefitIcons.length];
              return (
              <article key={benefit.title} className="rounded-2xl border border-[#ccb56b]/40 bg-white p-6">
                <Icon className="text-[#ccb56b]" size={28} />
                <h3 className="mt-5 text-xl font-bold">{renderRichText(benefit.title)}</h3>
                <p className="mt-3 text-sm leading-6 text-[#002060]/75">{renderRichText(benefit.description)}</p>
              </article>
              );
            })}
          </div>
        </section>

        <section className="bg-[#fff7df] px-5 py-16 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[.8fr_1.2fr] md:items-center">
            <UsersRound className="mx-auto text-[#ccb56b]" size={76} />
            <div>
              <p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.closingEyebrow)}</p>
              <h2 className="mt-3 text-3xl font-semibold">{renderRichText(content.closingTitle)}</h2>
              <p className="mt-4 leading-7 text-[#002060]/75">{renderRichText(content.closingDescription)}</p>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 font-bold underline decoration-[#ccb56b] decoration-2 underline-offset-4"><MessageCircle size={19} /> {renderRichText(content.closingCta)}</a>
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
