"use client";

import { AvisosCuenta, CargaCuenta, Seccion, useMiCuenta } from "@/components/cuenta/MiCuenta";
import PushDeviceManager from "@/components/push/PushDeviceManager";
import { PageHeader } from "@/components/ui/PageHeader";

export default function ConfiguracionAbogadoPage() {
  const { cuenta, error, cargar, reemplazar } = useMiCuenta();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Configuración" description="Qué avisos te llegan y en qué dispositivos." />
      {!cuenta ? (
        <CargaCuenta error={error} onReintentar={() => void cargar()} />
      ) : (
        <div className="space-y-6">
          <AvisosCuenta cuenta={cuenta} trato="tu" onCambio={reemplazar} />
          <Seccion id="navegador" titulo="Avisos al instante" descripcion="En estos dispositivos ves al momento los mensajes y las actuaciones nuevas, aunque no tengas el panel abierto.">
            <PushDeviceManager cuenta={cuenta} onCambio={reemplazar} trato="tu" />
          </Seccion>
        </div>
      )}
    </div>
  );
}
