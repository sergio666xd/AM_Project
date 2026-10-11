import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export default function PublicNotFound() {
  return (
    <MarketingLayout>
      <main className="mx-auto grid min-h-[55vh] max-w-7xl place-items-center px-5 py-16 text-center sm:px-8">
        <section className="w-full max-w-xl">
          <span className="mx-auto grid size-16 place-items-center rounded-full border border-[#d8c998] bg-[#f5efdc] text-[#002060]"><Compass aria-hidden="true" className="size-7" /></span>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-[#9c7e36]">Error 404</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#002060] sm:text-4xl">No encontramos esta página</h1>
          <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[#52617a]">El enlace pudo cambiar o la página ya no está disponible. Puedes volver al inicio o conocer nuestros servicios jurídicos.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#002060] px-5 py-2.5 text-sm font-semibold !text-white hover:bg-[#12377a]"><ArrowLeft aria-hidden="true" className="size-4" />Volver al inicio</Link>
            <Link href="/areas-de-practica" className="inline-flex min-h-11 items-center rounded-lg border border-[#c9cdd5] bg-white px-5 py-2.5 text-sm font-semibold text-[#002060] hover:bg-[#f5f6f8]">Ver áreas de práctica</Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
