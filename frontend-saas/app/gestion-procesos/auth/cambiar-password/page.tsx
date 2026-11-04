"use client";

import { type FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AuthShell, AvisoAcceso, CampoContrasena, TituloAcceso } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { safeInternalRedirect } from "@/lib/authRedirect";
import { homePathForRole, portalHrefForRole } from "@/lib/portalHosts";

function leerCorreoPendiente(): string {
  try {
    return localStorage.getItem("pending_user_email") || "";
  } catch {
    return "";
  }
}

function PrimeraContrasena() {
  const { user } = useSession();
  const params = useSearchParams();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const correo = user?.email || params.get("email") || (typeof window !== "undefined" ? leerCorreoPendiente() : "");

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (nueva !== confirmacion) return setError("Las dos contraseñas nuevas no coinciden.");
    setGuardando(true);
    const { data, error: fallo, response } = await api.POST("/api/v2/sesion/contrasena", { body: { contrasena_actual: actual, contrasena_nueva: nueva } });
    if (!data) {
      setGuardando(false);
      return setError(response?.status === 401 ? "Su sesión venció. Vuelva a ingresar con la contraseña temporal." : mensajeDeError(fallo));
    }
    try {
      localStorage.removeItem("pending_user_email");
    } catch {
      // Sin almacenamiento: no hay nada que limpiar.
    }
    const destino = safeInternalRedirect(params.get("redirect"));
    // Navegación completa para que el navegador ofrezca guardar la contraseña nueva.
    window.location.assign(portalHrefForRole(data.rol, destino || homePathForRole(data.rol)));
  }

  return (
    <AuthShell lema="Le damos la bienvenida al portal de la firma." detalle="Antes de empezar, cambie la contraseña temporal que le enviamos por una que solo usted conozca.">
      <TituloAcceso
        titulo="Cree su contraseña"
        texto={correo ? <>Es la que usará para entrar con <strong className="font-semibold text-ink">{correo}</strong>.</> : "Es la que usará para entrar al portal."}
      />
      <form onSubmit={guardar} className="mt-7 space-y-5">
        {/* El gestor de contraseñas del navegador necesita saber a qué cuenta pertenece. */}
        <input type="email" name="username" autoComplete="username" value={correo} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        {error && <AvisoAcceso tono="error">{error}</AvisoAcceso>}
        <CampoContrasena id="contrasena-temporal" etiqueta="Contraseña temporal" valor={actual} onCambio={setActual} autoComplete="current-password" ayuda="La que llegó en el correo o WhatsApp de bienvenida." />
        <CampoContrasena id="contrasena-nueva" etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" ayuda="Al menos 8 caracteres." />
        <CampoContrasena id="contrasena-confirmacion" etiqueta="Repita la contraseña nueva" valor={confirmacion} onCambio={setConfirmacion} autoComplete="new-password" invalido={Boolean(confirmacion) && confirmacion !== nueva} />
        <Button type="submit" size="lg" loading={guardando} className="w-full">Guardar e ingresar</Button>
      </form>
    </AuthShell>
  );
}

export default function CambiarPasswordPage() {
  return <Suspense fallback={<main aria-busy="true" className="min-h-dvh bg-ground" />}><PrimeraContrasena /></Suspense>;
}
