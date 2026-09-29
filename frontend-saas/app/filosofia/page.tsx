import { Compass, FileCheck2, Search, UserCheck, type LucideIcon } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";

const stepIcons: LucideIcon[] = [Search, Compass, FileCheck2, UserCheck];

export default async function Filosofia() {
  const content = await loadPublicPageContent("filosofia", SITE_PAGE_DEFAULTS.filosofia);
  return (
    <MarketingLayout>
      <main>
        <section className="bg-[#002060] px-5 py-20 text-white lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#ccb56b]">{content.eyebrow}</p><h1 className="mt-4 text-4xl font-semibold sm:text-5xl">{content.title}</h1><p className="mt-6 text-xl leading-8 text-white/80">{content.intro}</p></div>
            <div className="mt-16 grid gap-8 sm:grid-cols-3">{content.values.map((value) => <div key={value.number} className="border-t border-[#ccb56b]/60 pt-5"><span className="font-bold text-[#ccb56b]">{value.number}</span><h2 className="mt-2 text-2xl font-bold">{value.title}</h2><p className="mt-3 leading-7 text-white/75">{value.description}</p></div>)}</div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl text-center"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{content.methodologyEyebrow}</p><h2 className="mt-3 text-3xl font-semibold">{content.methodologyTitle}</h2><p className="mt-3 text-[#002060]/75">{content.methodologyDescription}</p></div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{content.steps.map((step, index) => { const Icon = stepIcons[index % stepIcons.length]; return <article key={step.step} className="rounded-xl border border-[#ccb56b]/40 bg-white p-6"><span className="rounded-full bg-[#fff7df] px-3 py-1 text-xs font-bold text-[#92792e]">{step.step}</span><Icon className="mt-5 text-[#002060]"/><h3 className="mt-4 text-lg font-bold">{step.title}</h3><p className="mt-3 text-sm leading-6 text-[#002060]/75">{step.description}</p></article>; })}</div>
        </section>
      </main>
    </MarketingLayout>
  );
}
