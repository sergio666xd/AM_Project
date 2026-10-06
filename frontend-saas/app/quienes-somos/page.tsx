import { renderRichText } from "@/components/marketing/RichText";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";

export default async function QuienesSomos() {
	const content = await loadPublicPageContent("quienes-somos", SITE_PAGE_DEFAULTS["quienes-somos"]);
	return <MarketingLayout><main className="mx-auto max-w-4xl px-5 py-16 lg:px-8"><p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{renderRichText(content.eyebrow)}</p><h1 className="mt-3 text-4xl font-semibold sm:text-5xl">{renderRichText(content.title)}</h1><p className="mt-6 text-xl leading-8 text-[#002060]/80">{renderRichText(content.intro)}</p><div className="mt-12 space-y-10">{content.sections.map((section) => <section key={section.title}><h2 className="text-2xl font-bold">{renderRichText(section.title)}</h2><p className="mt-3 leading-8 text-[#002060]/75">{renderRichText(section.body)}</p></section>)}</div></main></MarketingLayout>;
}
