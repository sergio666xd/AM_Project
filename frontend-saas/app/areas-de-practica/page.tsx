import { renderRichText } from "@/components/marketing/RichText";
import {
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  HeartHandshake,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"], "/areas-de-practica");
}

const areaIcons: Record<string, LucideIcon> = {
  family: HeartHandshake,
  business: BriefcaseBusiness,
  building: Building2,
  government: Landmark,
};

export default async function AreasDePractica() {
  const content = await loadPublicPageContent("areas-de-practica", SITE_PAGE_DEFAULTS["areas-de-practica"]);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.eyebrow)}</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{renderRichText(content.title)}</h1>
          <p className="mt-5 text-lg leading-8 text-[#002060]/75">{renderRichText(content.description)}</p>
        </div>
        <div className="mt-12 space-y-10">
          {content.areas.map((area) => {
            const Icon = areaIcons[area.icon] || BriefcaseBusiness;
            return (
              <article key={area.title} className="rounded-3xl border border-[#ccb56b]/40 bg-white p-7 shadow-sm lg:p-10">
                <div className="flex gap-5 border-b border-[#ccb56b]/30 pb-6">
                  <Icon className="shrink-0 text-[#ccb56b]" size={34} />
                  <div><h2 className="text-3xl font-bold">{renderRichText(area.title)}</h2><p className="mt-2 leading-7 text-[#002060]/75">{renderRichText(area.description)}</p></div>
                </div>
                <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {area.sections.map((section) => (
                    <section key={section.title} className="rounded-xl bg-[#fffdf8] p-5">
                      <h3 className="flex gap-2 text-lg font-bold"><CheckCircle2 className="shrink-0 text-[#ccb56b]" size={20} />{renderRichText(section.title)}</h3>
                      <ul className="mt-4 space-y-3 text-sm leading-6 text-[#002060]/75">{section.items.map((item) => <li key={item}>• {renderRichText(item)}</li>)}</ul>
                    </section>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
        <section className="mt-12 rounded-2xl bg-[#002060] p-8 text-center text-white">
          <h2 className="text-2xl font-semibold">{renderRichText(content.closingTitle)}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-white/75">{renderRichText(content.closingDescription)}</p>
          <a href="https://wa.me/573508809878" target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-lg bg-[#ccb56b] px-6 py-3 font-bold text-[#002060]">{renderRichText(content.closingCta)}</a>
        </section>
      </main>
    </MarketingLayout>
  );
}
