import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { formatPhone, loadPublicContact, whatsappDigits } from "@/lib/publicContact";

export async function SiteFooter() {
  const year = new Date().getFullYear();
  // Datos configurados por la administración (Administración > Datos de la firma).
  const contact = await loadPublicContact();
  const location = [contact.direccion, contact.ciudad].filter(Boolean).join(" · ");

  return (
    <footer className="mt-20 border-t border-border/80 bg-brand-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Identity & Purpose */}
          <div className="space-y-4">
            <h3 className="font-display text-xl font-medium text-white">{contact.nombre}</h3>
            <p className="text-xs leading-5 text-neutral-300">
              Asesoría jurídica preventiva, estratégica y cercana. Acompañamiento integral para personas, familias y empresas desde Sabaneta para toda Colombia.
            </p>
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
              {location && (
                <li className="flex items-start gap-2">
                  <MapPin className="size-4 shrink-0 text-gold-400 mt-0.5" aria-hidden="true" />
                  <span>{location}{contact.pais ? `, ${contact.pais}` : ""}</span>
                </li>
              )}
              {contact.whatsapp && (
                <li className="flex items-center gap-2">
                  <MessageCircle className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  <a href={`https://wa.me/${whatsappDigits(contact.whatsapp)}`} target="_blank" rel="noreferrer" className="hover:text-gold-300 transition-colors">
                    WhatsApp: {formatPhone(contact.whatsapp)}
                  </a>
                </li>
              )}
              {contact.telefono && (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  <a href={`tel:${contact.telefono.replace(/[^\d+]/g, "")}`} className="hover:text-gold-300 transition-colors">
                    {formatPhone(contact.telefono)}
                  </a>
                </li>
              )}
              {contact.correo_contacto && (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  <a href={`mailto:${contact.correo_contacto}`} className="break-all hover:text-gold-300 transition-colors">
                    {contact.correo_contacto}
                  </a>
                </li>
              )}
              {contact.correo_pqr && (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-gold-400" aria-hidden="true" />
                  <a href={`mailto:${contact.correo_pqr}`} className="break-all hover:text-gold-300 transition-colors">
                    PQR: {contact.correo_pqr}
                  </a>
                </li>
              )}
              {!contact.mostrar_contacto && (
                <li>
                  <Link href="/contacto" className="hover:text-gold-300 transition-colors">Escríbenos desde la página de contacto</Link>
                </li>
              )}
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
          <p>© {year} {contact.nombre}. Todos los derechos reservados.</p>
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
