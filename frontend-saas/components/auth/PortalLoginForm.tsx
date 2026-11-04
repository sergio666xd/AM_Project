"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { AuthShell, AvisoAcceso, CAMPO_ACCESO, CampoContrasena, TituloAcceso } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { safeInternalRedirect } from "@/lib/authRedirect";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

type Portal = "admin" | "users";

export function PortalLoginForm({ portal }: { portal: Portal }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recordarme, setRecordarme] = useState(true);
  const [error, setError] = useState("");
  const [otroPortal, setOtroPortal] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const router = useRouter();
  const { refreshUser } = useSession();
  const admin = portal === "admin";
  const enlaceOtroPortal = portalHrefForRole(admin ? "CLIENTE" : "ADMIN", "/login");

  function limpiar() {
    setError("");
    setOtroPortal(false);
  }

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    limpiar();
    setEntrando(true);
    try {
      // La API deja la sesión en una cookie httpOnly; aquí no se guarda ningún token.
      const { data: sesion, error: fallo } = await api.POST("/api/v2/sesion", {
        body: { email: email.trim(), password, recordarme },
      });
      if (!sesion) throw new Error(mensajeDeError(fallo));
      if (admin ? sesion.rol !== "ADMIN" : sesion.rol === "ADMIN") {
        setOtroPortal(true);
        setError(admin
          ? "Esta cuenta no es de administración. Entre por el portal de clientes y abogados."
          : "Las cuentas de administración entran por su propio portal.");
        // La cookie no debe quedar puesta en el portal equivocado.
        await api.DELETE("/api/v2/sesion");
        return;
      }
      const destino = safeInternalRedirect(new URLSearchParams(window.location.search).get("redirect"));
      if (sesion.debe_cambiar_password) {
        try {
          localStorage.setItem("pending_user_email", email.trim());
        } catch {
          // Sin almacenamiento: el correo también va en la dirección.
        }
        const params = new URLSearchParams({ email: email.trim() });
        if (destino) params.set("redirect", destino);
        router.replace(`/cambiar-password?${params.toString()}`);
        return;
      }
      await refreshUser();
      router.replace(portalHrefForRole(sesion.rol, destino || homePathForRole(sesion.rol)));
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : "No fue posible ingresar.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <AuthShell
      lema={admin ? "Administración del sistema de la firma." : "Sus procesos, claros y al día."}
      detalle={admin ? "Acceso solo para quienes administran la plataforma." : "Consulte en qué va cada proceso, lo que le pedimos y los mensajes con la firma."}
    >
      <TituloAcceso
        titulo={admin ? "Ingreso de administración" : "Ingresar al portal"}
        texto={admin ? "Esta entrada es independiente del portal de clientes y abogados." : "Con el correo y la contraseña de su cuenta."}
      />
      <form onSubmit={entrar} className="mt-7 space-y-5" aria-describedby={error ? "error-ingreso" : undefined}>
        {error && (
          <AvisoAcceso tono="error" id="error-ingreso">
            <p>{error}</p>
            {otroPortal && (
              <Link href={enlaceOtroPortal} className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-2">
                {admin ? "Ir al portal de clientes y abogados" : "Ir al portal de administración"}
              </Link>
            )}
          </AvisoAcceso>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[14px] font-semibold text-ink">Correo electrónico</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => { setEmail(e.target.value); limpiar(); }}
            aria-invalid={Boolean(error && !otroPortal) || undefined}
            className={CAMPO_ACCESO}
          />
        </label>
        <div>
          <CampoContrasena id="password" etiqueta="Contraseña" valor={password} onCambio={(v) => { setPassword(v); limpiar(); }} autoComplete="current-password" invalido={Boolean(error && !otroPortal)} />
          <p className="mt-1 text-right">
            <Link href="/recuperar-password" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-navy-ink underline-offset-2 hover:underline">
              ¿Olvidó su contraseña?
            </Link>
          </p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[14.5px] text-ink-2">
          <input type="checkbox" checked={recordarme} onChange={(e) => setRecordarme(e.target.checked)} className="size-4 accent-[var(--navy)]" />
          Mantener la sesión abierta en este dispositivo
        </label>
        <Button type="submit" size="lg" loading={entrando} className="w-full">
          {admin ? "Ingresar a administración" : "Ingresar"}
        </Button>
      </form>
      {!admin && (
        <p className="mt-8 border-t border-line pt-5 text-[14px] text-ink-2">
          ¿Aún no tiene cuenta? La firma la crea cuando empieza a llevar su proceso y le envía el acceso.
        </p>
      )}
    </AuthShell>
  );
}
