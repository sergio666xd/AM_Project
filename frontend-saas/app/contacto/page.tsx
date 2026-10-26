import { renderRichText } from "@/components/marketing/RichText";
import { Clock, Mail, MapPin, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { ContactForm } from "@/components/marketing/ContactForm";
import { loadPublicPageContent } from "@/lib/publicPageContent";
import { SITE_PAGE_DEFAULTS } from "@/lib/sitePageDefaults";
import { generatePublicPageMetadata } from "@/lib/pageSeo";

export function generateMetadata() {
  return generatePublicPageMetadata("contacto", SITE_PAGE_DEFAULTS.contacto, "/contacto");
}

const contactIcons: Record<string, LucideIcon> = { location: MapPin, clock: Clock, email: Mail };
const emailUrl = "mailto:alejandramunozabg@outlook.com?subject=Consulta%20jur%C3%ADdica";
const whatsappUrl = "https://wa.me/573508809878";

export default async function Contacto() {
  const content = await loadPublicPageContent("contacto", SITE_PAGE_DEFAULTS.contacto);

  // Structured data for FAQs
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <MarketingLayout>
      {/* FAQ Schema injection */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <main className="space-y-16 py-12 lg:py-16">
        {/* Hero banner */}
        <section className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="rounded-3xl border border-gold-400/30 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 px-8 py-12 text-white shadow-xl lg:flex lg:items-center lg:justify-between lg:p-14">
            <div className="max-w-2xl space-y-3">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-400">
                {renderRichText(content.eyebrow)}
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
                {renderRichText(content.title)}
              </h1>
              <p className="text-base sm:text-lg text-neutral-300 leading-relaxed">
                {renderRichText(content.intro)}
              </p>
            </div>
            <div className="mt-8 flex flex-col sm:flex-row lg:flex-col gap-3 lg:mt-0">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 py-3 text-sm font-bold text-brand-950 hover:bg-gold-300 transition-colors shadow-sm"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {renderRichText(content.whatsappCta)}
              </a>
              <a
                href={emailUrl}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold !text-white backdrop-blur-xs hover:bg-white/10 transition-colors"
              >
                <Mail className="size-4 text-gold-300" aria-hidden="true" />
                {renderRichText(content.emailCta)}
              </a>
            </div>
          </div>
        </section>

        {/* Contact Form + Information Grid */}
        <section className="mx-auto max-w-7xl px-5 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-start">
            {/* Left: Contact Form */}
            <ContactForm />

            {/* Right: Official Channels and Location */}
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-5">
                <h2 className="text-lg font-bold text-foreground">Canales de atención</h2>

                <div className="space-y-4">
                  {content.contactOptions.map((option) => {
                    const Icon = contactIcons[option.icon] || MapPin;
                    return (
                      <div key={option.title} className="flex items-start gap-3.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900 border border-brand-100">
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-foreground">
                            {renderRichText(option.title)}
                          </h3>
                          {option.icon === "email" ? (
                            <a
                              href={emailUrl}
                              className="mt-1 block text-xs font-semibold text-brand-900 underline hover:text-gold-600 transition-colors"
                            >
                              {renderRichText(option.description)}
                            </a>
                          ) : (
                            <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                              {renderRichText(option.description)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legal credentials card */}
              <div className="rounded-2xl border border-gold-400/30 bg-gold-400/10 p-6 space-y-3">
                <div className="flex items-center gap-2 text-brand-900 font-bold text-sm">
                  <ShieldCheck className="size-5 text-gold-600" aria-hidden="true" />
                  <span>Acreditación Profesional</span>
                </div>
                <p className="text-xs text-foreground-muted leading-relaxed">
                  Yeinny Alejandra Muñoz Marín · Abogada Titular con Tarjeta Profesional No. 375.092 expedida por el Consejo Superior de la Judicatura de Colombia.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQs Section */}
        <section className="mx-auto max-w-7xl border-t border-border px-5 pt-16 lg:px-8">
          <div className="max-w-2xl space-y-2 mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-gold-600">
              {renderRichText(content.faqEyebrow)}
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Preguntas Frecuentes
            </h2>
            <p className="text-sm text-foreground-muted">
              Respuestas claras a las dudas más comunes antes de iniciar un proceso o asesoría legal.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {content.faqs.map((faq) => (
              <article
                key={faq.question}
                className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-2.5"
              >
                <h3 className="text-base font-bold text-foreground leading-snug">
                  {renderRichText(faq.question)}
                </h3>
                <p className="text-sm leading-relaxed text-foreground-muted">
                  {renderRichText(faq.answer)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
