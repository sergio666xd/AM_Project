"use client";

import { type FormEvent, useState } from "react";

import { AuthShell, AvisoAcceso, CAMPO_ACCESO, TituloAcceso } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/Button";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";

export default function RecuperarPasswordPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    const { data, error: fallo } = await api.POST("/api/v2/sesion/recuperacion", { body: { email: email.trim() } });
    setEnviando(false);
    if (!data) return setError(mensajeDeError(fallo));
    setMensaje(data.mensaje);
  }

  return (
    <AuthShell lema="Recupere el acceso a su cuenta." volver={{ href: "/login", texto: "Volver al ingreso" }}>
      <TituloAcceso
        titulo="¿Olvidó su contraseña?"
        texto="Escriba el correo con el que entra al portal. Le enviaremos un enlace para crear una contraseña nueva."
      />
      {mensaje ? (
        <div className="mt-6 space-y-4">
          <AvisoAcceso tono="ok">
            {mensaje} El enlace sirve por 20 minutos. Si no lo ve, revise la carpeta de correo no deseado.
          </AvisoAcceso>
          <Button variant="secondary" onClick={() => setMensaje(null)}>Pedir otro enlace</Button>
        </div>
      ) : (
        <form onSubmit={enviar} className="mt-7 space-y-5">
          {error && <AvisoAcceso tono="error" id="error-recuperacion">{error}</AvisoAcceso>}
          <label className="block">
            <span className="mb-1.5 block text-[14px] font-semibold text-ink">Correo electrónico</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={error ? "error-recuperacion" : undefined}
              className={CAMPO_ACCESO}
            />
          </label>
          <Button type="submit" size="lg" loading={enviando} className="w-full">Enviar el enlace</Button>
        </form>
      )}
    </AuthShell>
  );
}
