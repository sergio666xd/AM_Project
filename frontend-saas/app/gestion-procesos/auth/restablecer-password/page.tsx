"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useSearchParams } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://192.168.78.226:8000";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/restablecer-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password_nueva: password }),
      });
      const data: { mensaje?: string; detail?: string } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "El enlace no es válido o ha expirado.");
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible restablecer la contraseña.");
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
        <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-[#92792e]">Seguridad de la cuenta</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">Crea una contraseña nueva</h1>
        {complete ? <div className="mt-6 space-y-5"><p role="status" className="rounded-lg border border-emerald-700/20 bg-white p-4 text-sm text-[#174d39]">Tu contraseña fue restablecida.</p><Link href="/gestion-procesos/auth/login" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#002060] py-3 font-semibold text-white hover:bg-[#003387]">Ingresar <KeyRound size={17} /></Link></div> : !token ? <div className="mt-6 space-y-5"><p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">El enlace no es válido o ha expirado.</p><Link href="/gestion-procesos/auth/recuperar-password" className="font-semibold underline decoration-[#ccb56b] underline-offset-4">Solicitar otro enlace</Link></div> : <>
          <p className="mt-3 text-[#002060]/70">El enlace es válido durante 20 minutos. La contraseña debe tener al menos 8 caracteres.</p>
          {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <form onSubmit={submit} className="mt-7 space-y-5">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Nueva contraseña</span><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-[#ccb56b]/60 bg-white px-4 py-3 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#ccb56b]/30" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Confirma la contraseña</span><input type="password" required minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border border-[#ccb56b]/60 bg-white px-4 py-3 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#ccb56b]/30" /></label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#002060] py-3 font-semibold text-white hover:bg-[#003387] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Guardando..." : "Guardar contraseña"}</button>
          </form>
        </>}
      </section>
    </main>
  );
}

export default function RestablecerPasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f7f3e8]" />}><ResetPasswordForm /></Suspense>;
}
