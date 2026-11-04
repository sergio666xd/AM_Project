"use client";

import { type FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AuthShell, AvisoAcceso, CampoContrasena, TituloAcceso } from "@/components/auth/AuthShell";
import { Button, clasesBoton } from "@/components/ui/Button";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";

function Restablecer() {
  const token = useSearchParams().get("token") || "";
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [enlaceVencido, setEnlaceVencido] = useState(!token);
  const [listo, setListo] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (nueva !== confirmacion) return setError("Las dos contraseñas no coinciden.");
    setGuardando(true);
    const { error: fallo } = await api.POST("/api/v2/sesion/restablecimiento", { body: { token, contrasena_nueva: nueva } });
    setGuardando(false);
    if (fallo) {
      if ("codigo" in fallo && fallo.codigo === "enlace_invalido") setEnlaceVencido(true);
      else setError(mensajeDeError(fallo));
      return;
    }
    setListo(true);
  }

  return (
    <AuthShell lema="Una contraseña nueva, en un minuto." volver={{ href: "/login", texto: "Volver al ingreso" }}>
      {enlaceVencido ? (
        <div className="space-y-5">
          <TituloAcceso titulo="Este enlace ya no sirve" texto="Los enlaces vencen a los 20 minutos y sirven una sola vez. Pida uno nuevo y úselo apenas llegue." />
          <Link href="/recuperar-password" className={clasesBoton("primary", "lg")}>Pedir un enlace nuevo</Link>
        </div>
      ) : listo ? (
        <div className="space-y-5">
          <TituloAcceso titulo="Contraseña guardada" />
          <AvisoAcceso tono="ok">Ya puede entrar al portal con su contraseña nueva.</AvisoAcceso>
          <Link href="/login" className={clasesBoton("primary", "lg")}>Ingresar</Link>
        </div>
      ) : (
        <>
          <TituloAcceso titulo="Cree una contraseña nueva" texto="Use al menos 8 caracteres. Mejor si mezcla letras, números y algún símbolo." />
          <form onSubmit={guardar} className="mt-7 space-y-5">
            {error && <AvisoAcceso tono="error">{error}</AvisoAcceso>}
            <CampoContrasena id="contrasena-nueva" etiqueta="Contraseña nueva" valor={nueva} onCambio={setNueva} autoComplete="new-password" />
            <CampoContrasena id="contrasena-confirmacion" etiqueta="Repita la contraseña" valor={confirmacion} onCambio={setConfirmacion} autoComplete="new-password" invalido={Boolean(confirmacion) && confirmacion !== nueva} />
            <Button type="submit" size="lg" loading={guardando} className="w-full">Guardar la contraseña</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function RestablecerPasswordPage() {
  return <Suspense fallback={<main aria-busy="true" className="min-h-dvh bg-ground" />}><Restablecer /></Suspense>;
}
