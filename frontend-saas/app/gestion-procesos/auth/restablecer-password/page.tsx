"use client";

import { type FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, KeyRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";

function PasswordField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <label htmlFor={id} className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><span className="relative block">
    <input id={id} name={id} type={visible ? "text" : "password"} required minLength={8} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#ccb56b]/80 bg-white px-4 py-3 pr-14 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" />
    <button type="button" onClick={() => setVisible((state) => !state)} aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} aria-pressed={visible} className="absolute right-1 top-1 grid min-h-11 min-w-11 place-items-center rounded text-[#002060]/75 hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button>
  </span></label>;
}

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
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (password !== confirmation) return setError("Las contraseñas no coinciden.");
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/restablecer-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password_nueva: password }),
      });
      const data: { detail?: string } = await response.json().catch(() => ({}));
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
      <section className="w-full max-w-md rounded-2xl border border-[#ccb56b]/45 bg-white p-6 shadow-sm sm:p-8">
        <Link href="/gestion-procesos/auth/login" className="inline-flex min-h-11 items-center gap-2 rounded px-1 text-sm font-semibold text-[#002060]/80 outline-none hover:text-[#002060] focus-visible:ring-2 focus-visible:ring-[#002060]"><ArrowLeft size={17} aria-hidden="true" /> Volver al ingreso</Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#765d19]">Seguridad de la cuenta</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">Crea una contraseña nueva</h1>
        {!token ? <div className="mt-6 space-y-4"><p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">El enlace no es válido o ha expirado.</p><Link href="/gestion-procesos/auth/recuperar-password" className="inline-flex min-h-11 items-center font-semibold underline decoration-[#92792e] underline-offset-4">Solicitar otro enlace</Link></div>
          : complete ? <div className="mt-6 space-y-5"><p role="status" aria-live="polite" className="rounded-lg border border-emerald-700/20 bg-emerald-50 p-4 text-sm text-[#174d39]">Tu contraseña fue restablecida.</p><Link href="/gestion-procesos/auth/login" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2">Ingresar <KeyRound size={17} aria-hidden="true" /></Link></div>
            : <>
              <p id="password-rules" className="mt-3 text-sm leading-6 text-[#002060]/80">El enlace vence después de 20 minutos. La contraseña debe tener al menos 8 caracteres.</p>
              {error && <p id="reset-error" role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
              <form onSubmit={submit} className="mt-7 space-y-5" aria-describedby={error ? "reset-error password-rules" : "password-rules"}>
                <PasswordField id="new-password" label="Nueva contraseña" value={password} onChange={setPassword} />
                <PasswordField id="confirm-password" label="Confirma la contraseña" value={confirmation} onChange={setConfirmation} />
                <button type="submit" disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Guardando…" : "Guardar contraseña"}</button>
              </form>
            </>}
      </section>
    </main>
  );
}

export default function RestablecerPasswordPage() {
  return <Suspense fallback={<main role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-[#f7f3e8] text-[#002060]/80">Cargando recuperación…</main>}><ResetPasswordForm /></Suspense>;
}
