import { renderRichText } from "@/components/marketing/RichText";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Building2, HeartHandshake, Landmark, Scale, ShieldCheck } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { MarketingContactCta } from "@/components/marketing/MarketingContactCta";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("inicio", SITE_PAGE_DEFAULTS.inicio, "/");
}

export default async function Home() {
  const content = await loadPublicPageContent("inicio", SITE_PAGE_DEFAULTS.inicio);
  const serviceIcons = [HeartHandshake, BriefcaseBusiness, Building2, Landmark];
  return <MarketingLayout><main>
    <section className="bg-[#002060] px-5 py-20 text-white lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div className="marketing-reveal"><p className="mb-5 text-sm font-bold uppercase tracking-[.2em] text-[#ccb56b]">{renderRichText(content.heroEyebrow)}</p><h1 className="max-w-4xl text-5xl font-semibold leading-tight sm:text-6xl">{renderRichText(content.heroTitle)}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">{renderRichText(content.heroDescription)}</p><a href="https://wa.me/573508809878" target="_blank" rel="noreferrer" className="marketing-cta mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#ccb56b] px-5 py-3 font-bold text-[#002060] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060]">{renderRichText(content.heroCta)} <ArrowRight size={18} aria-hidden="true" /></a></div>
        <aside className="marketing-float marketing-reveal marketing-reveal-delay-2 rounded-2xl border border-[#ccb56b]/70 p-7"><Scale className="text-[#ccb56b]" size={34}/><p className="mt-5 text-2xl leading-snug">{renderRichText(content.heroAside)}</p></aside>
      </div>
    </section>
    <section className="marketing-reveal mx-auto max-w-7xl px-5 py-16 lg:px-8"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.servicesEyebrow)}</p><h2 className="mt-3 text-3xl font-semibold sm:text-4xl">{renderRichText(content.servicesTitle)}</h2></div><div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{content.services.map((service, index) => { const Icon = serviceIcons[index % serviceIcons.length]; return <article key={service.title} className="marketing-card rounded-xl border border-[#ccb56b]/40 bg-white p-6"><Icon className="text-[#ccb56b]"/><h3 className="mt-5 text-xl font-bold">{renderRichText(service.title)}</h3><p className="mt-3 leading-7 text-[#002060]/75">{renderRichText(service.description)}</p></article>; })}</div><Link href="/areas-de-practica" className="mt-8 inline-block font-bold underline decoration-[#ccb56b] decoration-2 underline-offset-4">{renderRichText(content.servicesLink)}</Link></section>
    <section className="border-y border-[#ccb56b]/30 bg-[#fff7df] px-5 py-16 lg:px-8"><div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1.2fr] lg:items-center"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.preventionEyebrow)}</p><h2 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">{renderRichText(content.preventionTitle)}</h2><p className="mt-4 leading-7 text-[#002060]/75">{renderRichText(content.preventionDescription)}</p></div><div className="grid gap-4 rounded-xl border border-[#ccb56b]/40 bg-white/70 p-6 sm:grid-cols-2">{content.preventionItems.map((item) => <p key={item} className="flex gap-3 font-medium"><ShieldCheck className="shrink-0 text-[#ccb56b]" size={21}/>{renderRichText(item)}</p>)}</div></div></section>
    <section className="border-y border-[#ccb56b]/30 bg-[#fff7df] px-5 py-16 text-center lg:px-8"><h2 className="text-3xl font-semibold">{renderRichText(content.aboutTitle)}</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-[#002060]/75">{renderRichText(content.aboutDescription)}</p><Link href="/quienes-somos" className="mt-6 inline-block font-bold underline decoration-[#ccb56b] decoration-2 underline-offset-4">{renderRichText(content.aboutLink)}</Link></section>
    <div className="mx-auto max-w-7xl px-5 pb-16 lg:px-8"><MarketingContactCta /></div>
  </main></MarketingLayout>;
}
