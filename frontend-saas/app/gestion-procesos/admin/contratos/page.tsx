"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PanelContratos } from "@/components/contratos/PanelContratos";
import { TableroContratos } from "@/components/contratos/TableroContratos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Sheet } from "@/components/ui/Sheet";
import { api } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

const RUTA = "/gestion-procesos/admin/contratos";

function enlace(procesoId: number, contratoId?: number) {
  return `${RUTA}?proceso=${procesoId}${contratoId ? `&contrato=${contratoId}` : ""}`;
}

/** Sin proceso elegido, el tablero de contratos; con uno, sus contratos para gestionarlos. */
function ContratosAdmin() {
  const params = useSearchParams();
  const proceso = Number(params.get("proceso"));
  const contrato = Number(params.get("contrato"));

  if (!Number.isInteger(proceso) || proceso <= 0) {
    return <TableroContratos enlace={enlace} textoAbrir="Gestionar el contrato" />;
  }
  return <ContratosDelProceso proceso={proceso} contrato={Number.isInteger(contrato) && contrato > 0 ? contrato : null} />;
}

function ContratosDelProceso({ proceso, contrato }: { proceso: number; contrato: number | null }) {
  const [nombre, setNombre] = useState<string | null>(null);
  const cargar = useCallback(async () => {
    const { data } = await api.GET("/api/v2/procesos/{proceso_id}", { params: { path: { proceso_id: proceso } } });
    setNombre(data?.nombre ?? "");
  }, [proceso]);
  useLoadEffect(cargar);

  return (
    <div>
      <Link href={RUTA} className="inline-flex min-h-10 items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft size={16} aria-hidden /> Contratos
      </Link>
      <PageHeader title={nombre || "Contratos del proceso"} description="Redacte, deje listo, agende la firma o suba el firmado de los contratos de este proceso." />
      <Sheet className="overflow-hidden">
        <PanelContratos key={proceso} procesoId={proceso} contratoInicial={contrato} onCambio={() => undefined} />
      </Sheet>
    </div>
  );
}

export default function ContratosAdminRuta() {
  return <Suspense><ContratosAdmin /></Suspense>;
}
