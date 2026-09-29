"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Send } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.78.226:8000";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${API_URL}/api/auth/recuperar-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { mensaje?: string; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "No fue posible procesar la solicitud.");
      setNotice(data.mensaje || "Si existe una cuenta activa con ese correo, enviaremos un enlace para restablecer la contraseña.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible procesar la solicitud.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f3e8] px-5 py-10 text-[#002060] sm:px-8">
      <section className="w-full max-w-md">
        <Link href="/gestion-procesos/auth/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#002060]/70 hover:text-[#002060]">
          <ArrowLeft size={17} /> Volver al ingreso
        </Link>
        <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-[#92792e]">Recuperación de acceso</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">Restablece tu contraseña</h1>
        <p className="mt-3 text-[#002060]/70">Escribe el correo asociado a tu cuenta. Si está activa, recibirás un enlace temporal.</p>
        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {notice && <p role="status" className="mt-6 rounded-lg border border-emerald-700/20 bg-white p-4 text-sm text-[#174d39]">{notice}</p>}
        {!notice && <form onSubmit={submit} className="mt-7 space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-semibold">Correo electrónico</span><span className="relative block"><Mail className="pointer-events-none absolute left-4 top-3.5 text-[#92792e]" size={19} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-[#ccb56b]/60 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#ccb56b]/30" /></span></label>
          <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#002060] py-3 font-semibold text-white hover:bg-[#003387] disabled:cursor-not-allowed disabled:opacity-60">
            <Send size={17} /> {loading ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>}
      </section>
    </main>
  );
}
