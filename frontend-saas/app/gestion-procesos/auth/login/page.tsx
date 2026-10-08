"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail, Scale } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import GuestOnly from "@/components/auth/GuestOnly";
import { API_URL } from "@/lib/api";
import { safeInternalRedirect } from "@/lib/authRedirect";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useSession();

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const formData = new URLSearchParams({ username: email, password });
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: formData,
      });
      const data: { access_token?: string; detail?: string; debe_cambiar_password?: boolean } = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw new Error(data.detail || "Credenciales inválidas o cuenta inactiva.");
      localStorage.setItem("token", data.access_token);
      const redirect = safeInternalRedirect(new URLSearchParams(window.location.search).get("redirect"));
      if (data.debe_cambiar_password) {
        const changePasswordUrl = "/gestion-procesos/auth/cambiar-password";
        return router.push(redirect ? `${changePasswordUrl}?redirect=${encodeURIComponent(redirect)}` : changePasswordUrl);
      }
      await refreshUser();
      const meResponse = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      const me: { rol?: string; detail?: string } = await meResponse.json().catch(() => ({}));
      if (!meResponse.ok || !me.rol) throw new Error(me.detail || "No fue posible verificar los permisos de la cuenta.");
      return router.push(redirect || (me.rol === "ADMIN" ? "/gestion-procesos/admin" : me.rol === "ABOGADO_ADMIN" || me.rol === "ABOGADO" ? "/gestion-procesos/abogado" : "/gestion-procesos/cliente"));
    } catch (loginError: unknown) {
      setError(loginError instanceof Error ? loginError.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f7f3e8] text-[#002060] lg:grid lg:grid-cols-[.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-[#002060] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full border border-[#ccb56b]/30" />
        <div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full border border-[#ccb56b]/20" />
        <Image src="/AM_logo_Full_White.svg" alt="AM Abogada" width={245} height={82} className="relative h-auto w-48" priority />
        <div className="relative max-w-md"><p className="text-xs font-bold uppercase tracking-[.24em] text-[#ccb56b]">Gestión de procesos</p><h1 className="mt-5 text-5xl font-semibold leading-tight">Su práctica jurídica, bajo control.</h1><p className="mt-6 text-lg leading-8 text-white/80">Centralice procesos, actuaciones y tareas para tomar decisiones oportunas.</p></div>
        <p className="relative flex items-center gap-2 text-sm text-white/70"><Scale size={17} className="text-[#ccb56b]" /> Asesoría jurídica estratégica y cercana.</p>
      </aside>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-7 inline-flex items-center rounded-lg border border-[#ccb56b]/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#002060] transition hover:border-[#002060] hover:bg-white">← Página principal</Link>
          <Link href="/" className="mb-9 inline-block lg:hidden"><Image src="/AM_logo_Full_Black.svg" alt="AM Abogada" width={180} height={60} className="h-auto w-36" /></Link>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#92792e]">Acceso seguro</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight">Bienvenida de nuevo</h1>
          <p className="mt-3 text-[#002060]/70">Ingresa para consultar y gestionar tus procesos.</p>
          {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <form onSubmit={handleLogin} className="mt-7 space-y-5">
            <label className="block"><span className="mb-2 block text-sm font-semibold">Correo electrónico</span><span className="relative block"><Mail className="pointer-events-none absolute left-4 top-3.5 text-[#92792e]" size={19} /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="abogado@ejemplo.com" className="w-full rounded-lg border border-[#ccb56b]/60 bg-white py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[#002060]/35 focus:border-[#002060] focus:ring-2 focus:ring-[#ccb56b]/30" /></span></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Contraseña</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-4 top-3.5 text-[#92792e]" size={19} /><input type={showPassword ? "text" : "password"} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-[#ccb56b]/60 bg-white py-3 pl-11 pr-12 text-sm outline-none transition focus:border-[#002060] focus:ring-2 focus:ring-[#ccb56b]/30" /><button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Ver contraseña"} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-2.5 rounded p-1 text-[#002060]/60 hover:text-[#002060]">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></span></label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[#002060] py-3 font-semibold text-white transition hover:bg-[#003387] disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Ingresando..." : "Ingresar al aplicativo"}</button>
          </form>
          <p className="mt-4 text-right text-sm"><Link href="/gestion-procesos/auth/recuperar-password" className="font-semibold text-[#002060] underline decoration-[#ccb56b] underline-offset-4">¿Olvidaste tu contraseña?</Link></p>
          <p className="mt-7 border-t border-[#ccb56b]/35 pt-6 text-center text-sm text-[#002060]/70">¿Abogado externo? <Link href="/gestion-procesos/auth/registro" className="font-bold text-[#002060] underline decoration-[#ccb56b] decoration-2 underline-offset-4">Solicita tu acceso SaaS</Link></p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <GuestOnly><LoginForm /></GuestOnly>;
}
