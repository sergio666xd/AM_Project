"use client";

import { AvisosCuenta, CargaCuenta, DatosCuenta, Seccion, SeguridadCuenta, useMiCuenta } from "@/components/cuenta/MiCuenta";
import PushDeviceManager from "@/components/push/PushDeviceManager";
import { PageHeader } from "@/components/ui/PageHeader";

/** Mi cuenta de administración: datos, acceso, avisos y dispositivos. */
export default function AdminAccountPage() {
  const { cuenta, error, cargar, actualizar, reemplazar } = useMiCuenta();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Mi cuenta" description="Sus datos, cómo entra a la consola y qué avisos le llegan." />
      {!cuenta ? (
        <CargaCuenta error={error} onReintentar={() => void cargar()} />
      ) : (
        <div className="space-y-6">
          <DatosCuenta key={`datos-${cuenta.id}`} cuenta={cuenta} trato="usted" onGuardado={actualizar} />
          <SeguridadCuenta cuenta={cuenta} trato="usted" onCambio={() => actualizar()} />
          <AvisosCuenta cuenta={cuenta} trato="usted" onCambio={reemplazar} />
          <Seccion id="navegador" titulo="Avisos al instante" descripcion="En estos dispositivos verá al momento los mensajes nuevos, aunque no tenga la consola abierta.">
            <PushDeviceManager cuenta={cuenta} onCambio={reemplazar} trato="usted" />
          </Seccion>
        </div>
      )}
    </div>
  );
}
