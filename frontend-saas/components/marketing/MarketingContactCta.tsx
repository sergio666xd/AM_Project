import Link from "next/link";

export function MarketingContactCta() {
  return (
    <section className="mt-14 rounded-2xl bg-[#002060] p-7 text-white sm:p-9" aria-labelledby="firm-contact-heading">
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="firm-contact-heading" className="text-2xl font-semibold">¿Necesita orientación jurídica?</h2>
        <p className="mt-3 leading-7 text-white/85">Los servicios legales de la firma están disponibles independientemente de la plataforma de Gestión de Procesos.</p>
        <Link href="/contacto" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#ccb56b] px-6 py-3 font-bold text-[#002060] outline-none hover:bg-[#dcc982] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060]">Contactar a la firma</Link>
      </div>
    </section>
  );
}
