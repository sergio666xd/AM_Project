import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export function PanelNotFound({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-4xl place-items-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-lg rounded-[var(--radius-xl)] border border-border bg-surface p-7 text-center shadow-sm sm:p-9">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><Compass aria-hidden="true" className="size-7" /></span>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wider text-brand-700">Error 404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-foreground-muted">La ruta o el elemento solicitado no existe, o ya no está disponible en este panel.</p>
        <Link href={homeHref} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-lg)] bg-brand-900 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition-colors"><ArrowLeft aria-hidden="true" className="size-4" />{homeLabel}</Link>
      </section>
    </main>
  );
}
