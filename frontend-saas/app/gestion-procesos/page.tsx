import type { Metadata } from "next";
import Link from "next/link";
import { Activity, BellRing, BriefcaseBusiness, ClipboardCheck, ShieldCheck } from "lucide-react";

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
  { icon: BriefcaseBusiness, title: "Radicados bajo control", detail: "Consulta actuaciones judiciales desde un solo lugar." },
  { icon: Activity, title: "Historial de actuaciones", detail: "Revisa las novedades disponibles según tu plan." },
  { icon: ClipboardCheck, title: "Tareas conectadas", detail: "Organiza vencimientos, subtareas y recordatorios." },
  { icon: BellRing, title: "Notificaciones", detail: "Recibe avisos en los canales habilitados para tu cuenta." },
];

export default function GestionProcesosPage() {
  return (
    <MarketingLayout>
      <main>
        <section className="bg-[#002060] px-5 py-16 text-white lg:px-8 lg:py-20">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase text-[#ccb56b]">Plataforma SaaS para profesionales del derecho</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Gestión de Procesos</h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/80">Consulta radicados, detecta nuevas actuaciones y organiza el trabajo asociado a tu práctica jurídica.</p>
            </div>
            <div className="rounded-2xl border border-[#ccb56b]/60 bg-white/10 p-6 sm:p-8">
              <PlansAvailability />
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8" aria-labelledby="saas-benefits-heading">
          <h2 id="saas-benefits-heading" className="mb-6 text-2xl font-semibold text-[#002060]">Funciones de la plataforma</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, detail }) => (
              <article key={title} className="rounded-xl border border-[#ccb56b]/40 bg-white p-6">
                <Icon className="text-[#92792e]" size={22} aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold text-[#002060]">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#002060]/70">{detail}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm text-[#002060]/75"><ShieldCheck size={17} aria-hidden="true" /> La información de cada cuenta SaaS se mantiene aislada por usuario.</p>
        </section>
        <section className="border-y border-[#ccb56b]/30 bg-[#fffdf8] px-5 py-12 lg:px-8" aria-labelledby="firm-services-heading">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[.15em] text-[#92792e]">Servicios jurídicos de la firma</p>
              <h2 id="firm-services-heading" className="mt-2 text-2xl font-semibold text-[#002060]">La atención legal de la firma está disponible</h2>
              <p className="mt-2 leading-7 text-[#002060]/75">Estos servicios profesionales son independientes del lanzamiento y los planes de la plataforma SaaS.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/areas-de-practica" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#002060] px-5 py-3 text-center font-bold !text-white outline-none hover:bg-[#0a347a] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Ver áreas de práctica</Link>
              <Link href="/contacto" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#002060] px-5 py-3 text-center font-bold text-[#002060] outline-none hover:bg-[#002060]/5 focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Contactar a la firma</Link>
            </div>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
