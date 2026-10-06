"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

export default function CambiarPasswordPage() {
  const router = useRouter();
  const [actual, setActual] = useState(""); const [nueva, setNueva] = useState(""); const [confirmacion, setConfirmacion] = useState(""); const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (nueva.length < 8) return setError("La nueva contraseña debe tener al menos 8 caracteres.");
    if (nueva !== confirmacion) return setError("Las contraseñas no coinciden.");
    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/cambiar-password`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }, body: JSON.stringify({ password_actual: actual, password_nueva: nueva }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "No fue posible cambiar la contraseña.");
      const redirect = new URLSearchParams(window.location.search).get("redirect");
      router.replace(redirect
        ? `/gestion-procesos/auth/login?redirect=${encodeURIComponent(redirect)}`
        : "/gestion-procesos/auth/login");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cambiar la contraseña."); } finally { setSending(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#f7f3e8] px-5 text-[#002060]"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.2em] text-[#92792e]">Primer ingreso</p><h1 className="mt-3 text-3xl font-semibold">Cree su contraseña</h1><p className="mt-2 text-sm text-[#002060]/70">Por seguridad, debe reemplazar la contraseña temporal antes de continuar.</p>{error && <p className="mt-4 text-sm text-red-700">{error}</p>}<div className="mt-6 space-y-4"><input required type="password" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Contraseña temporal" className="w-full rounded-lg border p-3"/><input required type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva contraseña" className="w-full rounded-lg border p-3"/><input required type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder="Confirmar nueva contraseña" className="w-full rounded-lg border p-3"/></div><button disabled={sending} className="mt-6 w-full rounded-lg bg-[#002060] py-3 font-semibold text-white disabled:opacity-60">{sending ? "Guardando…" : "Guardar contraseña"}</button></form></main>;
}
