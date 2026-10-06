import type { Metadata } from "next";
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
    siteName: "Alejandra Mu?oz Abogada y Asociados",
    title: "Gesti?n de Procesos para abogados",
    description: "Consulta radicados y organiza tareas de tu pr?ctica jur?dica.",
    url: new URL("/gestion-procesos", SITE_URL).toString(),
  },
  twitter: { card: "summary" },
  robots: { index: true, follow: true },
};

const benefits = [
  { icon: BriefcaseBusiness, title: "Radicados bajo control", detail: "Consulta actuaciones judiciales desde un solo lugar." },
  { icon: Activity, title: "Historial de actuaciones", detail: "Revisa novedades disponibles según tu plan." },
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
              <p className="text-sm font-bold uppercase text-[#ccb56b]">Servicio SaaS para abogados externos</p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Gestión de Procesos</h1>
              <p className="mt-5 max-w-xl text-lg leading-8 text-white/80">Consulta radicados, detecta nuevas actuaciones y organiza el trabajo asociado a tu práctica.</p>
            </div>
            <div className="rounded-2xl border border-[#ccb56b]/60 bg-white/10 p-6 sm:p-8">
              <PlansAvailability />
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, detail }) => (
              <article key={title} className="rounded-xl border border-[#ccb56b]/40 bg-white p-6">
                <Icon className="text-[#92792e]" size={22} />
                <h2 className="mt-4 text-lg font-semibold text-[#002060]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#002060]/70">{detail}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm text-[#002060]/65"><ShieldCheck size={17} /> Cada cuenta SaaS conserva sus radicados y tareas aislados por usuario.</p>
        </section>
      </main>
    </MarketingLayout>
  );
}
