"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";

const AREAS = [
  "Personas y Familia (Divorcios, Sucesiones, Cuotas)",
  "Empresas y Contratos (Sociedades, Blindaje)",
  "Propiedad Horizontal e Inmuebles",
  "Póliza Jurídica Preventiva",
  "Derecho Administrativo y Estatal",
  "Otro asunto jurídico",
];

export function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [area, setArea] = useState(AREAS[0]);
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !phone.trim() || !email.trim()) {
      setError("Por favor completa los campos obligatorios (Nombre, Teléfono y Correo).");
      return;
    }

    if (!consent) {
      setError("Debes autorizar el tratamiento de datos para poder recibir respuesta.");
      return;
    }

    setSubmitted(true);
  }

  const structuredWhatsAppText = encodeURIComponent(
    `Hola, mi nombre es ${name.trim()}.\n` +
    `*Correo:* ${email.trim()}\n` +
    `*Teléfono:* ${phone.trim()}\n` +
    `*Área de interés:* ${area}\n` +
    `*Consulta:* ${message.trim() || "Deseo recibir orientación jurídica inicial."}`
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">Envíanos tu consulta</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Completa el formulario y te responderemos a la mayor brevedad posible.
        </p>
      </div>

      {submitted ? (
        <div className="space-y-5 rounded-xl border border-success/30 bg-success-light p-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-success text-white">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">¡Información lista para enviar!</h3>
            <p className="mt-2 text-xs text-foreground-muted leading-relaxed">
              Hemos preparado tu solicitud. Para una respuesta inmediata, puedes enviarla directamente a nuestro WhatsApp oficial:
            </p>
          </div>
          <div className="pt-2">
            <a
              href={`https://wa.me/573508809878?text=${structuredWhatsAppText}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-bold text-brand-950 hover:bg-gold-300 transition-colors"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              Enviar mensaje a WhatsApp
            </a>
          </div>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="text-xs text-brand-900 underline hover:text-gold-600 transition-colors"
          >
            Modificar datos o redactar otra consulta
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-xs text-danger">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="contact-name" className="block text-xs font-semibold text-foreground-secondary mb-1">
              Nombre completo *
            </label>
            <input
              id="contact-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-700"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-phone" className="block text-xs font-semibold text-foreground-secondary mb-1">
                WhatsApp o teléfono *
              </label>
              <input
                id="contact-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="300 000 0000"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="block text-xs font-semibold text-foreground-secondary mb-1">
                Correo electrónico *
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-700"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contact-area" className="block text-xs font-semibold text-foreground-secondary mb-1">
              Área de tu consulta *
            </label>
            <select
              id="contact-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-700"
            >
              {AREAS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="contact-message" className="block text-xs font-semibold text-foreground-secondary mb-1">
              Cuéntanos brevemente sobre tu caso
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe tu situación o qué inquietud necesitas resolver..."
              className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-700"
            />
          </div>

          <label className="flex items-start gap-2 pt-1 text-xs text-foreground-muted cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 rounded border-border"
            />
            <span>
              Autorizo el tratamiento de mis datos personales de acuerdo con la{" "}
              <Link href="/tratamiento-de-datos" className="text-brand-900 underline hover:text-gold-600">
                Política de tratamiento de datos
              </Link>.
            </span>
          </label>

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-900 px-5 py-3 text-sm font-bold text-white hover:bg-brand-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <Send className="size-4 text-gold-300" aria-hidden="true" />
              Enviar solicitud de asesoría
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

