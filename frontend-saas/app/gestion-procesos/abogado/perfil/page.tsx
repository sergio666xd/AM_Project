"use client";

import { CargaCuenta, DatosCuenta, SeguridadCuenta, useMiCuenta } from "@/components/cuenta/MiCuenta";
import { PageHeader } from "@/components/ui/PageHeader";

export default function PerfilAbogadoPage() {
  const { cuenta, error, cargar, actualizar } = useMiCuenta();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Mi perfil" description="Tus datos para los documentos de la firma y cómo entras al panel." />
      {!cuenta ? (
        <CargaCuenta error={error} onReintentar={() => void cargar()} />
      ) : (
        <div className="space-y-6">
          <DatosCuenta key={`datos-${cuenta.id}`} cuenta={cuenta} trato="tu" onGuardado={actualizar} />
          <SeguridadCuenta cuenta={cuenta} trato="tu" onCambio={() => actualizar()} />
        </div>
      )}
    </div>
  );
}
