import Link from "next/link";
import { ArrowRight, MessageCircle, PhoneCall } from "lucide-react";

export function MarketingContactCta() {
  return (
    <section
      className="mt-16 overflow-hidden rounded-3xl border border-gold-400/30 bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 p-8 text-white sm:p-12 shadow-xl relative"
      aria-labelledby="firm-contact-heading"
    >
      {/* Decorative background glow */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-gold-400/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl text-center space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/40 bg-gold-400/10 px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-gold-300">
          Atención jurídica personalizada
        </span>
        <h2 id="firm-contact-heading" className="text-3xl sm:text-4xl font-display font-medium tracking-[-0.01em] text-white">
          ¿Tiene un asunto legal o requiere asesoría preventiva?
        </h2>
        <p className="mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-neutral-300">
          Analizamos la viabilidad de su caso con rigor técnico y honestidad. Agende una consulta o escríbanos directamente para evaluar su situación.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <a
            href="https://wa.me/573508809878?text=Hola%2C%20quisiera%20recibir%20orientaci%C3%B3n%20jur%C3%ADdica%20para%20un%20caso."
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-gold-400 px-6 py-3 text-sm font-bold text-brand-950 transition-all hover:bg-gold-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            Escribir por WhatsApp
          </a>
          <Link
            href="/contacto"
            className="inline-flex min-h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/5 px-6 py-3 text-sm font-semibold !text-white backdrop-blur-xs transition-all hover:bg-white/10 hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <PhoneCall className="size-4 text-gold-300" aria-hidden="true" />
            Canales de contacto y PQR
            <ArrowRight className="size-4 text-gold-300" aria-hidden="true" />
          </Link>
        </div>

        <p className="text-xs text-neutral-400 pt-2">
          Atención en Sabaneta, Antioquia y representación en toda Colombia · T.P. 375.092 C.S. de la J.
        </p>
      </div>
    </section>
  );
}
