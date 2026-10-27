import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowRight, BellRing, BriefcaseBusiness, ClipboardCheck, ShieldCheck } from "lucide-react";

import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { PlansAvailability } from "@/components/marketing/PlansAvailability";
import { SITE_URL } from "@/lib/siteUrl";

export const metadata: Metadata = {
  title: "Gestión de Procesos para abogados",
  description: "Consulta radicados y organiza tareas de tu práctica jurídica.",
  alternates: { canonical: "/gestion-procesos" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Alejandra Muñoz Abogada y Asociados",
    title: "Gestión de Procesos para abogados",
    description: "Consulta radicados y organiza tareas de tu práctica jurídica.",
    url: new URL("/gestion-procesos", SITE_URL).toString(),
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
};

const benefits = [
  { icon: BriefcaseBusiness, title: "Radicados bajo control", detail: "Consulta actuaciones judiciales desde un solo lugar de forma automatizada." },
  { icon: Activity, title: "Historial de actuaciones", detail: "Revisa las novedades procesales disponibles según tu plan contratado." },
  { icon: ClipboardCheck, title: "Tareas conectadas", detail: "Organiza vencimientos, términos perentorios, subtareas y recordatorios." },
  { icon: BellRing, title: "Notificaciones multicanal", detail: "Recibe avisos inmediatos en los canales habilitados para tu cuenta." },
];

export default function GestionProcesosPage() {
  return (
    <MarketingLayout>
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-brand-950 via-brand-900 to-brand-950 px-5 py-16 text-white lg:px-8 lg:py-24 border-b border-gold-400/20">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div className="space-y-5">
              <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-400">
                Plataforma SaaS para profesionales del derecho
              </span>
              <h1 className="text-4xl sm:text-5xl font-display font-medium tracking-[-0.01em] text-white leading-tight">
                Gestión de Procesos
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-neutral-300">
                Consulta radicados de la Rama Judicial, detecta nuevas actuaciones y organiza el trabajo asociado a tu práctica jurídica individual o colectiva.
              </p>
            </div>
            <div className="rounded-3xl border border-gold-400/30 bg-white/5 p-6 sm:p-8 backdrop-blur-md shadow-2xl">
              <PlansAvailability />
            </div>
          </div>
        </section>

        {/* Benefits Grid */}
        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8" aria-labelledby="saas-benefits-heading">
          <div className="max-w-2xl space-y-2 mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-gold-600">
              Ventajas de la plataforma
            </span>
            <h2 id="saas-benefits-heading" className="text-3xl font-display font-medium tracking-[-0.01em] text-foreground">
              Funciones diseñadas para litigantes
            </h2>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, detail }) => (
              <article key={title} className="marketing-card rounded-2xl border border-border bg-surface p-6 shadow-xs hover:border-gold-400 transition-all space-y-3">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-900">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
                <p className="text-sm leading-relaxed text-foreground-muted">{detail}</p>
              </article>
            ))}
          </div>

          <p className="mt-8 flex items-center gap-2 text-xs text-foreground-muted">
            <ShieldCheck className="size-4 text-gold-600 shrink-0" aria-hidden="true" />
            La información y expedientes de cada cuenta SaaS se mantienen 100% aislados por usuario y firma.
          </p>
        </section>

        {/* Firm Legal Services Banner */}
        <section className="border-y border-border bg-surface-secondary px-5 py-16 lg:px-8" aria-labelledby="firm-services-heading">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-gold-600">
                Servicios jurídicos de la firma
              </span>
              <h2 id="firm-services-heading" className="text-2xl sm:text-3xl font-display font-medium tracking-[-0.01em] text-foreground">
                La asesoría profesional de la firma está disponible
              </h2>
              <p className="text-sm leading-relaxed text-foreground-muted">
                Estos servicios de representación y consultoría legal son independientes del software de Gestión de Procesos.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/areas-de-practica"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-2.5 text-sm font-bold !text-white hover:bg-brand-950 transition-colors"
              >
                Ver áreas de práctica
                <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
              </Link>
              <Link
                href="/contacto"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-surface-hover transition-colors"
              >
                Contactar a la firma
              </Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
