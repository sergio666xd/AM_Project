import { Clock, Mail, MapPin, MessageCircle, type LucideIcon } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";

const contactIcons: Record<string, LucideIcon> = { location: MapPin, clock: Clock, email: Mail };
const emailUrl = "mailto:alejandramunozabg@outlook.com?subject=Consulta%20jur%C3%ADdica";
const whatsappUrl = "https://wa.me/573508809878";

export default async function Contacto() {
  const content = await loadPublicPageContent("contacto", SITE_PAGE_DEFAULTS.contacto);
  return (
    <MarketingLayout>
      <main className="space-y-14 py-16">
        <section className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="rounded-3xl bg-[#ccb56b] px-8 py-12 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[.2em]">{content.eyebrow}</p><h1 className="mt-4 text-4xl font-semibold sm:text-5xl">{content.title}</h1><p className="mt-5 text-xl leading-8">{content.intro}</p></div>
            <div className="mt-8 flex flex-col gap-3 lg:mt-0">
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#002060] px-6 py-3 font-bold text-white"><MessageCircle size={20} />{content.whatsappCta}</a>
              <a href={emailUrl} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#002060] px-6 py-3 font-bold"><Mail size={20} />{content.emailCta}</a>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-7xl gap-5 px-5 md:grid-cols-3 lg:px-8">
          {content.contactOptions.map((option) => {
            const Icon = contactIcons[option.icon] || MapPin;
            return <article key={option.title} className="rounded-xl border border-[#ccb56b]/40 bg-white p-6"><Icon className="text-[#ccb56b]}" /><h2 className="mt-4 text-xl font-bold">{option.title}</h2>{option.icon === "email" ? <a className="mt-3 block font-semibold underline" href={emailUrl}>{option.description}</a> : <p className="mt-3 leading-7 text-[#002060]/75">{option.description}</p>}</article>;
          })}
        </section>
        <section className="mx-auto max-w-7xl border-t border-[#ccb56b]/30 px-5 pt-12 lg:px-8">
          <p className="text-sm font-bold uppercase tracking-[.2em] text-[#92792e]">{content.faqEyebrow}</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">{content.faqs.map((faq) => <article key={faq.question} className="rounded-xl border border-[#ccb56b]/35 bg-white p-5"><h2 className="font-bold">{faq.question}</h2><p className="mt-3 leading-7 text-[#002060]/75">{faq.answer}</p></article>)}</div>
        </section>
      </main>
    </MarketingLayout>
  );
}
