import Link from "next/link";
import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t border-border/80 bg-brand-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Identity & Purpose */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white tracking-tight">
              Alejandra Muñoz
              <span className="block text-xs font-normal text-gold-400 uppercase tracking-widest mt-0.5">
                Abogada y Asociados
              </span>
            </h3>
            <p className="text-xs leading-5 text-neutral-300">
              Asesoría jurídica preventiva, estratégica y cercana. Acompañamiento integral para personas, familias y empresas desde Sabaneta para toda Colombia.
            </p>
            <div className="flex items-center gap-2 text-xs text-gold-300/90 pt-1">
              <ShieldCheck className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
              <span>T.P. 375.092 C.S. de la J.</span>
            </div>
          </div>

          {/* Column 2: Legal Practice Areas */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">
              Áreas de práctica
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-neutral-300">
              <li>
                <Link href="/areas-de-practica" className="hover:text-gold-300 transition-colors">
                  Familia, sucesiones y pareja
                </Link>
              </li>
              <li>
                <Link href="/areas-de-practica" className="hover:text-gold-300 transition-colors">
                  Contratos y derecho empresarial
                </Link>
              </li>
              <li>
                <Link href="/areas-de-practica" className="hover:text-gold-300 transition-colors">
                  Propiedad horizontal y bienes
                </Link>
              </li>
              <li>
                <Link href="/poliza-juridica" className="hover:text-gold-300 transition-colors">
                  Póliza jurídica preventiva
                </Link>
              </li>
              <li>
                <Link href="/areas-de-practica" className="hover:text-gold-300 transition-colors">
                  Derecho administrativo y estatal
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Location */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">
              Ubicación y atención
            </h4>
            <ul className="mt-4 space-y-3 text-xs text-neutral-300">
              <li className="flex items-start gap-2">
                <MapPin className="size-4 shrink-0 text-gold-400 mt-0.5" aria-hidden="true" />
                <span>Sabaneta, Antioquia · Cobertura nacional en Colombia</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                <a
                  href="https://wa.me/573508809878"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-gold-300 transition-colors"
                >
                  WhatsApp: +57 350 880 9878
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                <a
                  href="mailto:alejandramunozabg@outlook.com"
                  className="hover:text-gold-300 transition-colors"
                >
                  alejandramunozabg@outlook.com
                </a>
              </li>
              <li className="text-neutral-400 text-[11px] pt-1">
                Lunes a Viernes · 8:00 AM – 5:00 PM
              </li>
            </ul>
          </div>

          {/* Column 4: Platform & Legal */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gold-400">
              Accesos y marco legal
            </h4>
            <ul className="mt-4 space-y-2.5 text-xs text-neutral-300">
              <li>
                <Link href="/gestion-procesos/auth/login" className="hover:text-gold-300 transition-colors font-medium text-white">
                  Portal de clientes
                </Link>
              </li>
              <li>
                <Link href="/gestion-procesos" className="hover:text-gold-300 transition-colors">
                  Gestión de procesos para abogados
                </Link>
              </li>
              <li>
                <Link href="/filosofia" className="hover:text-gold-300 transition-colors">
                  Nuestra filosofía preventiva
                </Link>
              </li>
              <li>
                <Link href="/politica-de-privacidad" className="hover:text-gold-300 transition-colors">
                  Política de privacidad
                </Link>
              </li>
              <li>
                <Link href="/tratamiento-de-datos" className="hover:text-gold-300 transition-colors">
                  Tratamiento de datos personales
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <p>© {year} Alejandra Muñoz | Abogada y Asociados. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6 text-[11px]">
            <Link href="/politica-de-privacidad" className="hover:text-white transition-colors">Privacidad</Link>
            <span aria-hidden="true" className="text-white/20">·</span>
            <Link href="/tratamiento-de-datos" className="hover:text-white transition-colors">Habeas Data</Link>
            <span aria-hidden="true" className="text-white/20">·</span>
            <Link href="/contacto" className="hover:text-white transition-colors">PQR</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
