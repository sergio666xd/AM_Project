import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export function PanelNotFound({ homeHref, homeLabel }: { homeHref: string; homeLabel: string }) {
  return (
    <main className="mx-auto grid min-h-[60vh] max-w-4xl place-items-center px-4 py-10 sm:px-6">
      <section className="w-full max-w-lg rounded-xl bg-sheet p-7 text-center shadow-sheet sm:p-9">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-manila text-ink-2"><Compass aria-hidden="true" className="size-6" /></span>
        <h1 className="mt-4 font-display text-[24px] leading-tight text-ink">No encontramos esta página</h1>
        <p className="mt-2 text-[14px] text-ink-3">La ruta o el elemento solicitado no existe, o ya no está disponible en este panel.</p>
        <Link href={homeHref} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy px-3.5 text-[14px] font-semibold text-on-navy transition-colors hover:bg-navy-hover sm:min-h-10"><ArrowLeft aria-hidden="true" className="size-4" />{homeLabel}</Link>
      </section>
    </main>
  );
}
