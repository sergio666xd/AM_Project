"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail, Scale } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { API_URL } from "@/lib/api";
import { safeInternalRedirect } from "@/lib/authRedirect";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

type Portal = "admin" | "users";

export function PortalLoginForm({ portal }: { portal: Portal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [wrongPortal, setWrongPortal] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useSession();
  const isAdminPortal = portal === "admin";
  const alternatePortalHref = portalHrefForRole(isAdminPortal ? "CLIENTE" : "ADMIN", "/login");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setWrongPortal(false);
    setLoading(true);
    try {
      const formData = new URLSearchParams({ username: email.trim(), password });
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });
      const data: { access_token?: string; detail?: string; debe_cambiar_password?: boolean } = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw new Error(data.detail || "Correo o contraseña incorrectos, o cuenta inactiva.");

      const meResponse = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
      const me: { rol?: string; detail?: string } = await meResponse.json().catch(() => ({}));
      if (!meResponse.ok || !me.rol) throw new Error(me.detail || "No fue posible verificar los permisos de la cuenta.");

      const roleMatchesPortal = isAdminPortal ? me.rol === "ADMIN" : me.rol !== "ADMIN";
      if (!roleMatchesPortal) {
        setWrongPortal(true);
        setError(isAdminPortal
          ? "Esta cuenta no es administradora. Continúa desde el portal de cliente y abogado."
          : "El acceso de administración tiene un portal separado. Continúa desde el portal administrativo.");
        return;
      }

      localStorage.setItem("token", data.access_token);
      const redirect = safeInternalRedirect(new URLSearchParams(window.location.search).get("redirect"));
      if (data.debe_cambiar_password) {
        router.replace(redirect
          ? `/cambiar-password?redirect=${encodeURIComponent(redirect)}`
          : "/cambiar-password");
        return;
      }
      await refreshUser();
      router.replace(redirect || homePathForRole(me.rol));
    } catch (loginError) {
      setWrongPortal(false);
      setError(loginError instanceof Error ? loginError.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f3e8] text-[#002060] lg:grid lg:grid-cols-[.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-[#002060] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full border border-[#ccb56b]/30" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-24 h-80 w-80 rounded-full border border-[#ccb56b]/20" aria-hidden="true" />
        <Image src="/AM_logo_Full_White.svg" alt="AM Abogada" width={245} height={82} className="relative h-auto w-48" priority />
        <div className="relative max-w-md"><p className="text-xs font-bold uppercase tracking-[.24em] text-[#f0d98b]">{isAdminPortal ? "Administración de la plataforma" : "Portal de clientes y abogados"}</p><h1 className="mt-5 text-5xl font-semibold leading-tight">{isAdminPortal ? "Gestione el servicio con seguridad." : "Su práctica jurídica, bajo control."}</h1><p className="mt-6 text-lg leading-8 text-white/85">{isAdminPortal ? "Acceso exclusivo para administrar el sistema y la operación." : "Consulte procesos, actuaciones y tareas desde un solo lugar."}</p></div>
        <p className="relative flex items-center gap-2 text-sm text-white/85"><Scale size={17} className="text-[#f0d98b]" aria-hidden="true" /> Alejandra Muñoz | Abogada y Asociados</p>
      </aside>
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <a href="https://www.alejandramunozabogada.com" className="mb-7 inline-flex min-h-11 items-center rounded-lg border border-[#ccb56b]/60 px-3 py-2 text-xs font-bold uppercase tracking-wide outline-none transition hover:border-[#002060] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#002060]">← Ir al sitio público</a>
          <a href="https://www.alejandramunozabogada.com" aria-label="Alejandra Muñoz, inicio" className="mb-9 inline-block lg:hidden"><Image src="/AM_logo_Full_Black.svg" alt="AM Abogada" width={180} height={60} className="h-auto w-36" /></a>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#765d19]">{isAdminPortal ? "Acceso administrativo" : "Acceso seguro"}</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold leading-tight">{isAdminPortal ? "Ingresar como administrador" : "Bienvenida de nuevo"}</h2>
          <p className="mt-3 text-[#002060]/80">{isAdminPortal ? "Esta entrada está separada del portal público." : "Ingresa para consultar y gestionar tus procesos."}</p>
          {error && <div id="login-error" role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            <p>{error}</p>
            {wrongPortal && <Link href={alternatePortalHref} className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-red-800">{isAdminPortal ? "Ir al portal de cliente y abogado" : "Ir al portal administrativo"}</Link>}
          </div>}
          <form onSubmit={handleLogin} className="mt-7 space-y-5" aria-describedby={error ? "login-error" : undefined}>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Correo electrónico</span><span className="relative block"><Mail className="pointer-events-none absolute left-4 top-3.5 text-[#765d19]" size={19} aria-hidden="true" /><input type="email" name="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); setError(""); setWrongPortal(false); }} aria-invalid={Boolean(error && !wrongPortal)} aria-describedby={error ? "login-error" : undefined} className="min-h-11 w-full rounded-lg border border-[#ccb56b]/80 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /></span></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold">Contraseña</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-4 top-3.5 text-[#765d19]" size={19} aria-hidden="true" /><input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); setError(""); setWrongPortal(false); }} aria-invalid={Boolean(error && !wrongPortal)} aria-describedby={error ? "login-error" : undefined} className="min-h-11 w-full rounded-lg border border-[#ccb56b]/80 bg-white py-3 pl-11 pr-14 text-sm outline-none transition focus:border-[#002060] focus:ring-2 focus:ring-[#002060]/30" /><button type="button" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-1 top-1 grid min-h-11 min-w-11 place-items-center rounded text-[#002060]/75 hover:bg-[#fff7df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002060]">{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></span></label>
            <button type="submit" disabled={loading} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#002060] px-4 py-3 font-semibold !text-white outline-none transition hover:bg-[#003387] focus-visible:ring-2 focus-visible:ring-[#92792e] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Verificando acceso…" : isAdminPortal ? "Ingresar a administración" : "Ingresar al portal"}</button>
          </form>
          {!isAdminPortal && <>
            <p className="mt-4 text-right text-sm"><Link href="/recuperar-password" className="inline-flex min-h-11 items-center font-semibold text-[#002060] underline decoration-[#92792e] underline-offset-4">¿Olvidaste tu contraseña?</Link></p>
            <p className="mt-7 border-t border-[#ccb56b]/50 pt-5 text-center text-sm text-[#002060]/80">¿Abogado externo? <Link href="/gestion-procesos/auth/registro" className="inline-flex min-h-11 items-center font-bold text-[#002060] underline decoration-[#92792e] decoration-2 underline-offset-4">Solicita tu acceso SaaS</Link></p>
          </>}
          {isAdminPortal && <p className="mt-7 border-t border-[#ccb56b]/50 pt-5 text-sm text-[#002060]/80">¿Necesitas recuperar tu cuenta? <Link href="/recuperar-password" className="inline-flex min-h-11 items-center font-bold underline decoration-[#92792e] underline-offset-4">Solicita un enlace de restablecimiento</Link>.</p>}
        </div>
      </section>
    </main>
  );
}
