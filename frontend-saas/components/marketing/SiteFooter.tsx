import Link from "next/link";

export function SiteFooter() {
  return <footer className="mt-16 bg-[#002060] px-5 py-10 text-white lg:px-8">
    <div className="mx-auto flex max-w-7xl flex-col justify-between gap-6 text-sm sm:flex-row">
      <p>© {new Date().getFullYear()} • Alejandra Muñoz | Abogada y Asociados.</p>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-[#f2e7bd]">
        <Link href="/politica-de-privacidad">Política de privacidad</Link>
        <Link href="/tratamiento-de-datos">Tratamiento de datos personales</Link>
      </div>
    </div>
  </footer>;
}
