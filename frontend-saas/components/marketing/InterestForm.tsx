"use client";

import Link from "next/link";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";
import { FormEvent, useState } from "react";
import { API_URL } from "@/lib/api";

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InterestForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sending, setSending] = useState(false);

  function validate(value: string) {
    const cleanEmail = value.trim();
    if (!cleanEmail) return "Escriba su correo profesional para continuar.";
    if (!validEmail.test(cleanEmail)) return "Ingrese un correo válido, por ejemplo nombre@correo.com.";
    return "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate(email);
    setError(validationError);
    setSuccess("");
    if (validationError) return;
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/intereses-saas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), website, autorizacion_datos: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "No fue posible registrar el correo. Inténtelo nuevamente.");
      setSuccess(data.mensaje);
      setEmail("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible registrar el correo. Inténtelo nuevamente.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form id="registro-interes" onSubmit={submit} className="mt-8 max-w-xl" noValidate>
      <label htmlFor="lead-email" className="mb-2 block text-sm font-semibold">Correo electrónico:</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="lead-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={120}
          value={email}
          onChange={(event) => { setEmail(event.target.value); if (error) setError(""); if (success) setSuccess(""); }}
          onBlur={() => setError(validate(email))}
          aria-invalid={Boolean(error)}
          aria-describedby="lead-help lead-feedback"
          placeholder="nombre@correo.com"
          className={`min-h-11 min-w-0 flex-1 rounded-lg border bg-white px-4 py-3 text-[#002060] outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-300" : "border-[#ccb56b] focus:ring-[#ccb56b]"}`}
        />
        <button type="submit" disabled={sending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#ccb56b] px-5 py-3 font-bold text-[#002060] outline-none transition hover:bg-[#dcc982] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#002060] disabled:cursor-not-allowed disabled:opacity-60">
          {sending && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}{sending ? "Registrando…" : "Quiero conocerla"}
        </button>
      </div>
      <input aria-hidden="true" tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(event) => setWebsite(event.target.value)} className="hidden" />
      <p id="lead-help" className="mt-3 text-xs leading-5 text-white/85">
        Al enviar sus datos, acepta la <Link href="/politica-de-privacidad" className="font-semibold text-[#f0d98b] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-white">Política de privacidad</Link> y la <Link href="/tratamiento-de-datos" className="font-semibold text-[#f0d98b] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-white">Política de tratamiento de datos personales</Link>.
      </p>
      {(error || success) && <p id="lead-feedback" role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"} className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium ${error ? "bg-red-50 text-red-700" : "bg-[#fff7df] text-[#002060]"}`}>
        {error ? <CircleAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 shrink-0 text-[#92792e]" size={18} aria-hidden="true" />}{error || success}
      </p>}
    </form>
  );
}
