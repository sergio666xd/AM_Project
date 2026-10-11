"use client";

import { type FormEvent, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { API_URL } from "@/lib/api";
import { safeInternalRedirect } from "@/lib/authRedirect";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span><span className="relative block">
    <input required type={visible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-[#ccb56b]/70 bg-white px-4 py-3 pr-14 text-sm outline-none focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" />
    <button type="button" onClick={() => setVisible((state) => !state)} aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`} aria-pressed={visible} className="absolute right-1 top-1 grid min-h-11 min-w-11 place-items-center rounded text-[#002060]/75 hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">{visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button>
  </span></label>;
}

export default function CambiarPasswordPage() {
  const { user } = useSession();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirmacion) return setError("Las contraseñas no coinciden.");
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/cambiar-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ password_actual: actual, password_nueva: nueva }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "No fue posible cambiar la contraseña.");
      const redirect = safeInternalRedirect(new URLSearchParams(window.location.search).get("redirect"));
      const destination = portalHrefForRole(user?.rol || "CLIENTE", redirect || homePathForRole(user?.rol || "CLIENTE"));
      window.location.assign(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible cambiar la contraseña.");
    } finally {
      setSending(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f7f3e8] px-5 py-10 text-[#002060]">
    <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-[#ccb56b]/45 bg-white p-6 shadow-sm sm:p-8" aria-describedby={error ? "password-change-error" : "password-guidance"}>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#765d19]">Primer ingreso</p>
      <h1 className="mt-3 text-3xl font-semibold">Crea tu contraseña</h1>
      <p id="password-guidance" className="mt-2 text-sm leading-6 text-[#002060]/80">Reemplaza la contraseña temporal para continuar. Usa al menos 8 caracteres.</p>
      {error && <p id="password-change-error" role="alert" className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      <div className="mt-6 space-y-4">
        <PasswordField label="Contraseña temporal" value={actual} onChange={setActual} autoComplete="current-password" />
        <PasswordField label="Nueva contraseña" value={nueva} onChange={setNueva} autoComplete="new-password" />
        <PasswordField label="Confirma la nueva contraseña" value={confirmacion} onChange={setConfirmacion} autoComplete="new-password" />
      </div>
      <button type="submit" disabled={sending} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{sending ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  </main>;
}
