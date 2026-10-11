"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, Send } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/auth/recuperar-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (response.status >= 500) throw new Error("El servicio no está disponible en este momento. Inténtalo de nuevo más tarde.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f3e8] px-5 py-10 text-[#002060] sm:px-8">
      <section className="w-full max-w-md rounded-2xl border border-[#ccb56b]/45 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/gestion-procesos/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded px-1 text-sm font-semibold text-[#002060]/80 outline-none hover:text-[#002060] focus-visible:ring-2 focus-visible:ring-[#002060]"><ArrowLeft size={17} aria-hidden="true" /> Volver al ingreso</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#765d19]">Recuperación de acceso</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">Restablece tu contraseña</h1>
        <p className="mt-3 leading-6 text-[#002060]/80">Escribe el correo asociado a tu cuenta. El enlace de restablecimiento vence después de 20 minutos.</p>
        {error && <p id="recovery-error" role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        {sent ? <div className="mt-6 space-y-4">
          <p role="status" aria-live="polite" className="flex gap-3 rounded-lg border border-emerald-700/20 bg-emerald-50 p-4 text-sm leading-6 text-[#174d39]"><CheckCircle2 className="mt-0.5 shrink-0" size={19} aria-hidden="true" />Si existe una cuenta activa con ese correo, enviaremos un enlace para restablecer la contraseña. Revisa también la carpeta de correo no deseado.</p>
          <button type="button" onClick={() => { setSent(false); setError(""); }} className="inline-flex min-h-11 items-center rounded-lg border border-[#002060]/30 px-4 py-2 text-sm font-semibold outline-none hover:bg-[#f7f3e8] focus-visible:ring-2 focus-visible:ring-[#002060]">Solicitar otro enlace</button>
        </div> : <form onSubmit={submit} className="mt-7 space-y-5">
          <label htmlFor="recovery-email" className="block"><span className="mb-2 block text-sm font-semibold">Correo electrónico</span><span className="relative block"><Mail className="pointer-events-none absolute left-4 top-3.5 text-[#765d19]" size={19} aria-hidden="true" /><input id="recovery-email" type="email" name="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-describedby={error ? "recovery-error" : undefined} aria-invalid={Boolean(error)} className="min-h-11 w-full rounded-lg border border-[#ccb56b]/80 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /></span></label>
          <button type="submit" disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><Send size={17} aria-hidden="true" /> {loading ? "Enviando…" : "Enviar enlace"}</button>
        </form>}
      </section>
    </main>
  );
}
