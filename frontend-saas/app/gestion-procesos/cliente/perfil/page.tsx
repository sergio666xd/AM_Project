"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { AvisosCliente, DatosCliente, DispositivosCliente } from "@/components/portal-cliente/perfil";
import { FilasCargando, TituloCliente } from "@/components/portal-cliente/piezas";
import { SecurityChangeButton } from "@/components/security/SecurityChangeButton";
import { Button, clasesBoton } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import type { PerfilCliente } from "@/lib/portalCliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

export default function PerfilClientePage() {
  const { token, refreshUser } = useSession();
  const [perfil, setPerfil] = useState<PerfilCliente | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cliente/perfil");
    if (data) setPerfil(data);
    else setError(mensajeDeError(fallo));
  }, []);
  useLoadEffect(cargar);

  // Configuración y los avisos antiguos llegan con #avisos.
  useEffect(() => {
    if (perfil && window.location.hash === "#avisos") document.getElementById("avisos")?.scrollIntoView({ block: "start" });
  }, [perfil]);

  const alCambiarDato = async () => {
    await refreshUser();
    await cargar();
  };
  const boton = clasesBoton("secondary", "lg");

  return (
    <div className="mx-auto max-w-3xl">
      <TituloCliente sub="Sus datos y cómo quiere que le avisemos.">Su perfil</TituloCliente>
      {error && !perfil ? (
        <Sheet className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <p role="alert" className="text-bad">{error}</p>
          <Button variant="secondary" size="lg" icon={<RefreshCw aria-hidden="true" size={16} />} onClick={() => void cargar()}>Intentar de nuevo</Button>
        </Sheet>
      ) : !perfil ? (
        <div aria-busy="true" className="space-y-6">
          <Sheet><FilasCargando filas={3} /></Sheet>
          <Sheet><FilasCargando filas={4} /></Sheet>
        </div>
      ) : (
        <div className="space-y-6">
          <AvisosCliente perfil={perfil} onCambio={(avisos) => setPerfil((actual) => actual && { ...actual, avisos })} />
          <DispositivosCliente />
          <DatosCliente
            perfil={perfil}
            onSolicitud={(solicitud) => setPerfil((actual) => actual && { ...actual, solicitud })}
            seguridad={
              <>
                <SecurityChangeButton action="email" title="Cambiar correo" token={token} whatsappAvailable={Boolean(perfil.whatsapp)} onComplete={alCambiarDato} claseBoton={boton} />
                <SecurityChangeButton action="whatsapp" title={perfil.whatsapp ? "Cambiar WhatsApp" : "Registrar WhatsApp"} token={token} whatsappAvailable={Boolean(perfil.whatsapp)} onComplete={alCambiarDato} claseBoton={boton} />
                <SecurityChangeButton action="password" title="Cambiar contraseña" token={token} whatsappAvailable={Boolean(perfil.whatsapp)} onComplete={alCambiarDato} claseBoton={boton} />
              </>
            }
          />
        </div>
      )}
    </div>
  );
}
