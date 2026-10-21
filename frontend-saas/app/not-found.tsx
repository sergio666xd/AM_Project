import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export default function PublicNotFound() {
  return (
    <MarketingLayout>
      <main className="mx-auto grid min-h-[60vh] max-w-7xl place-items-center px-5 py-20 text-center sm:px-8">
        <section className="w-full max-w-xl space-y-4">
          <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-gold-400/40 bg-gold-400/10 text-brand-900 shadow-sm">
            <Compass aria-hidden="true" className="size-8 text-gold-600" />
          </span>
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-gold-600">
            Página no encontrada · Error 404
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            No encontramos esta dirección
          </h1>
          <p className="mx-auto max-w-md text-sm sm:text-base leading-relaxed text-foreground-muted">
            El enlace pudo cambiar de ubicación o ya no está disponible. Puedes volver al inicio o consultar nuestras áreas de práctica legal.
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-3.5">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-950 transition-colors shadow-xs"
            >
              <ArrowLeft aria-hidden="true" className="size-4 text-gold-300" />
              Volver al inicio
            </Link>
            <Link
              href="/areas-de-practica"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-brand-900 hover:bg-surface-hover transition-colors"
            >
              Ver áreas de práctica
            </Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
