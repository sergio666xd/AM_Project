import { renderRichText } from "@/components/marketing/RichText";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  HeartHandshake,
  Landmark,
  Lock,
  MessageCircle,
  Scale,
  ShieldCheck,
} from "lucide-react";
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

  return (
    <MarketingLayout>
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 px-5 py-16 text-white sm:py-20 lg:px-8 lg:py-24 border-b border-gold-400/20">
          {/* Subtle background glow */}
          <div
            className="pointer-events-none absolute -left-40 top-0 size-96 rounded-full bg-gold-400/10 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-0 bottom-0 size-96 rounded-full bg-brand-700/20 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
            <div className="marketing-reveal space-y-6">
              <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
                <span className="h-px w-8 bg-gold-400" aria-hidden="true" />
                {renderRichText(content.heroEyebrow)}
              </p>

              <h1 style={{ textWrap: "balance" }} className="max-w-4xl text-4xl sm:text-5xl lg:text-6xl font-display font-medium tracking-[-0.01em] text-white leading-[1.12]">
                {renderRichText(content.heroTitle)}
              </h1>

              <p className="max-w-2xl text-lg sm:text-xl leading-relaxed text-neutral-300 font-normal">
                {renderRichText(content.heroDescription)}
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <a
                  href="https://wa.me/573508809878?text=Hola%2C%20quiero%20recibir%20asesor%C3%ADa%20jur%C3%ADdica."
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-gold-400 px-6 py-3.5 text-sm font-bold text-brand-950 transition-all hover:bg-gold-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {renderRichText(content.heroCta)}
                </a>
                <Link
                  href="/areas-de-practica"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 py-3.5 text-sm font-semibold !text-white backdrop-blur-xs transition-all hover:bg-white/10 hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Conocer áreas de práctica
                  <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
                </Link>
              </div>

              {/* Trust badges row */}
              <div className="pt-4 flex flex-wrap items-center gap-y-2 gap-x-6 text-xs text-neutral-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-gold-400" aria-hidden="true" />
                  Sabaneta, Antioquia y Cobertura Nacional
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-gold-400" aria-hidden="true" />
                  Atención directa con abogada titular
                </span>
              </div>
            </div>

            {/* Aside Credential Card */}
            <aside className="marketing-reveal marketing-reveal-delay-2 rounded-3xl border border-gold-400/30 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
              <div className="flex items-center gap-3 border-b border-white/10 pb-5">
                <span className="grid size-12 place-items-center rounded-2xl bg-gold-400/20 text-gold-300">
                  <Scale className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-white">Alejandra Muñoz Marín</h2>
                  <p className="text-xs text-gold-300">T.P. 375.092 C.S. de la J.</p>
                </div>
              </div>

              <blockquote className="mt-5 text-xl font-medium leading-snug text-neutral-200 italic">
                “{renderRichText(content.heroAside)}”
              </blockquote>

              <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 gap-4 text-left">
                <div>
                  <p className="text-2xl font-bold text-gold-400">+10</p>
                  <p className="text-xs text-neutral-400">Años de trayectoria</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gold-400">100%</p>
                  <p className="text-xs text-neutral-400">Enfoque preventivo</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        {/* Value pillars bar */}
        <section
          aria-label="Pilares de servicio"
          className="border-b border-border bg-surface px-5 py-8 lg:px-8"
        >
          <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900 border border-brand-100">
                <Scale className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Rigor técnico</h3>
                <p className="text-xs text-foreground-muted mt-0.5">Soluciones fundamentadas en derecho procesal y jurisprudencia vigente.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900 border border-brand-100">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Prevención activa</h3>
                <p className="text-xs text-foreground-muted mt-0.5">Blindaje de acuerdos antes de que se conviertan en litigios costosos.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900 border border-brand-100">
                <HeartHandshake className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Cercanía humana</h3>
                <p className="text-xs text-foreground-muted mt-0.5">Explicamos el panorama en un lenguaje claro, sin tecnicismos opacos.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900 border border-brand-100">
                <Lock className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-foreground">Confidencialidad</h3>
                <p className="text-xs text-foreground-muted mt-0.5">Protección integral de su información y secreto profesional estricto.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Practice Areas / Services Section */}
        <section className="marketing-reveal mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-3xl text-center space-y-3">
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
              {renderRichText(content.servicesEyebrow)}
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-medium tracking-[-0.01em] text-foreground">
              {renderRichText(content.servicesTitle)}
            </h2>
            <p className="text-base text-foreground-muted">
              Respuestas jurídicas integrales adaptadas a las necesidades específicas de cada situación.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {content.services.map((service, index) => {
              const Icon = serviceIcons[index % serviceIcons.length];
              return (
                <article
                  key={service.title}
                  className="marketing-card group flex flex-col justify-between rounded-2xl border border-border bg-surface p-6 shadow-xs hover:border-gold-400 hover:shadow-md transition-all"
                >
                  <div>
                    <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-900 group-hover:bg-gold-50 group-hover:text-gold-700 transition-colors">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-foreground">
                      {renderRichText(service.title)}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-foreground-muted">
                      {renderRichText(service.description)}
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-border">
                    <Link
                      href="/areas-de-practica"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-900 group-hover:text-gold-600 transition-colors"
                    >
                      Consultar área
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/areas-de-practica"
              className="inline-flex items-center gap-2 rounded-xl border border-brand-900 px-6 py-3 text-sm font-bold text-brand-900 hover:bg-brand-900 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700"
            >
              {renderRichText(content.servicesLink)}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* Prevention Section */}
        <section className="border-y border-border bg-surface-secondary px-5 py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div className="space-y-4">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
                {renderRichText(content.preventionEyebrow)}
              </span>
              <h2 className="text-3xl sm:text-4xl font-display font-medium tracking-[-0.01em] text-foreground leading-tight">
                {renderRichText(content.preventionTitle)}
              </h2>
              <p className="text-base leading-relaxed text-foreground-muted">
                {renderRichText(content.preventionDescription)}
              </p>
              <div className="pt-2">
                <a
                  href="https://wa.me/573508809878?text=Hola%2C%20quiero%20consultar%20antes%20de%20firmar%20un%20acuerdo."
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-900 px-5 py-2.5 text-sm font-semibold !text-white hover:bg-brand-950 transition-colors"
                >
                  <MessageCircle className="size-4 text-gold-300" aria-hidden="true" />
                  Consultar antes de firmar
                </a>
              </div>
            </div>

            <div className="grid gap-3.5 rounded-2xl border border-border bg-surface p-6 sm:p-8 sm:grid-cols-2 shadow-xs">
              {content.preventionItems.map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-secondary/50 p-3.5"
                >
                  <ShieldCheck className="size-5 shrink-0 text-gold-500 mt-0.5" aria-hidden="true" />
                  <span className="text-sm font-medium text-foreground">{renderRichText(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Poliza Juridica Feature Highlight */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="rounded-3xl border border-gold-400/30 bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 p-8 sm:p-12 text-white shadow-xl">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-gold-300">
                  Para empresas y copropiedades
                </span>
                <h2 className="text-3xl sm:text-4xl font-display font-medium tracking-[-0.01em] text-white">
                  Póliza Jurídica Preventiva
                </h2>
                <p className="text-base text-neutral-300 leading-relaxed max-w-2xl">
                  Tranquilidad jurídica continua sin costos imprevistos. Cobertura mensual en contratos, acompañamiento a juntas, cobro prejurídico y defensa ante reclamaciones.
                </p>
                <div className="pt-2 flex flex-wrap gap-3">
                  <Link
                    href="/poliza-juridica"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold-400 px-6 py-2.5 text-sm font-bold text-brand-950 hover:bg-gold-300 transition-colors"
                  >
                    Conocer la póliza jurídica
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3 backdrop-blur-xs">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gold-300">
                  Beneficios incluidos
                </h3>
                <ul className="space-y-2 text-xs text-neutral-300">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-gold-400 shrink-0" aria-hidden="true" />
                    <span>Revisión y elaboración ilimitada de contratos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-gold-400 shrink-0" aria-hidden="true" />
                    <span>Cobro prejurídico de cartera morosa</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-gold-400 shrink-0" aria-hidden="true" />
                    <span>Asesoría laboral y comercial continua</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-gold-400 shrink-0" aria-hidden="true" />
                    <span>Tarifa fija mensual sin sorpresas</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* About section preview */}
        <section className="border-t border-border bg-surface px-5 py-16 text-center lg:px-8">
          <div className="mx-auto max-w-3xl space-y-4">
            <h2 className="text-2xl sm:text-3xl font-display font-medium tracking-[-0.01em] text-foreground">
              {renderRichText(content.aboutTitle)}
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-foreground-muted">
              {renderRichText(content.aboutDescription)}
            </p>
            <div className="pt-2">
              <Link
                href="/quienes-somos"
                className="inline-flex items-center gap-2 text-sm font-bold text-brand-900 hover:text-gold-600 transition-colors"
              >
                {renderRichText(content.aboutLink)}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
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
