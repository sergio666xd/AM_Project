"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { DocumentosProceso } from "@/components/documentos/DocumentosProceso";
import { CabeceraExpediente } from "@/components/expediente/CabeceraExpediente";
import { FoliosExpediente } from "@/components/expediente/FoliosExpediente";
import { PanelAgenda } from "@/components/expediente/PanelAgenda";
import { PanelContratos } from "@/components/contratos/PanelContratos";
import { PanelChat } from "@/components/expediente/PanelChat";
import { PanelEquipo } from "@/components/expediente/PanelEquipo";
import { PanelRelaciones } from "@/components/expediente/PanelRelaciones";
import { PanelResumen } from "@/components/expediente/PanelResumen";
import { PanelTareas } from "@/components/expediente/PanelTareas";
import { CobrosProceso } from "@/components/finanzas/CobrosProceso";
import { Button } from "@/components/ui/Button";
import { CaratulaTabs } from "@/components/ui/CaratulaTabs";
import { Sheet } from "@/components/ui/Sheet";
import { useSession } from "@/context/SessionContext";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { useLoadEffect } from "@/lib/useLoadEffect";

export type Proceso = Esquemas["ProcesoDetalle"];
export type Relaciones = Esquemas["RelacionesProceso"];

const BASE = "/gestion-procesos/abogado/procesos";
const SECCIONES = ["resumen", "folios", "relaciones", "agenda", "tareas", "documentos", "contratos", "cobros", "comunicaciones", "equipo"] as const;
type Seccion = (typeof SECCIONES)[number];

/** "actividad" era la línea de tiempo que hoy son los folios; los enlaces viejos siguen sirviendo. */
function seccionDe(valor: string | null | undefined): Seccion | null {
  const limpia = (valor ?? "").replace(/^panel-/, "");
  const pedida = limpia === "actividad" ? "folios" : limpia;
  return (SECCIONES as readonly string[]).includes(pedida) ? (pedida as Seccion) : null;
}

function leerUbicacion(section?: string) {
  const params = new URLSearchParams(window.location.search);
  const contrato = Number(params.get("contrato"));
  const folio = Number(params.get("folio"));
  let hash = window.location.hash.slice(1);
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* el hash queda como vino */
  }
  return {
    seccion: seccionDe(hash) ?? seccionDe(section) ?? seccionDe(params.get("tab")) ?? (contrato > 0 ? "contratos" : "resumen"),
    contrato: Number.isInteger(contrato) && contrato > 0 ? contrato : null,
    folio: Number.isInteger(folio) && folio > 0 ? folio : null,
  };
}

/** El expediente de un proceso: carátula con la etapa y, debajo, sus secciones como pestañas. */
export function Expediente({ procesoId, section }: { procesoId: number; section?: string }) {
  const { user } = useSession();
  const [proceso, setProceso] = useState<Proceso | null>(null);
  const [relaciones, setRelaciones] = useState<Relaciones | null>(null);
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null);
  const [ubicacion, setUbicacion] = useState<{ seccion: Seccion; contrato: number | null; folio: number | null }>({
    seccion: seccionDe(section) ?? "resumen", contrato: null, folio: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const sincronizar = () => setUbicacion(leerUbicacion(section));
    sincronizar();
    window.addEventListener("hashchange", sincronizar);
    window.addEventListener("popstate", sincronizar);
    return () => {
      window.removeEventListener("hashchange", sincronizar);
      window.removeEventListener("popstate", sincronizar);
    };
  }, [section]);

  const cargar = useCallback(async () => {
    const ruta = { params: { path: { proceso_id: procesoId } } };
    const [detalle, vinculos] = await Promise.all([
      api.GET("/api/v2/procesos/{proceso_id}", ruta),
      api.GET("/api/v2/procesos/{proceso_id}/relaciones", ruta),
    ]);
    if (detalle.data && vinculos.data) {
      setProceso(detalle.data);
      setRelaciones(vinculos.data);
      setError(null);
    } else {
      const fallo = detalle.error ?? vinculos.error;
      setError({ mensaje: mensajeDeError(fallo), noExiste: detalle.response.status === 404 });
    }
  }, [procesoId]);
  useLoadEffect(cargar);

  const recargar = useCallback(() => {
    setVersion((v) => v + 1);
    void cargar();
  }, [cargar]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="font-display text-[22px] text-ink">{error.noExiste ? "No encontramos el proceso" : "No se pudo abrir el expediente"}</p>
        <p className="mt-2 text-[14px] text-ink-2">{error.noExiste ? "Puede que no sea un proceso suyo o que se haya archivado." : error.mensaje}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href={BASE} className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-[14px] font-semibold text-navy-ink hover:bg-manila">Ver los procesos</Link>
          {!error.noExiste && <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void cargar()}>Reintentar</Button>}
        </div>
      </div>
    );
  }

  const cobra = user?.rol === "ABOGADO_ADMIN" || user?.rol === "ADMIN";
  const conEquipo = user?.rol !== "ABOGADO";
  const pestanas: { id: Seccion; label: string; count?: number }[] = [
    { id: "resumen", label: "Resumen" },
    { id: "folios", label: "Folios" },
    { id: "relaciones", label: "Clientes y radicados" },
    { id: "agenda", label: "Agenda" },
    { id: "tareas", label: "Tareas" },
    { id: "documentos", label: "Documentos" },
    { id: "contratos", label: "Contratos" },
    ...(cobra ? [{ id: "cobros" as const, label: "Cobros" }] : []),
    { id: "comunicaciones", label: "Chat" },
    ...(conEquipo ? [{ id: "equipo" as const, label: "Equipo" }] : []),
  ];
  const activa = pestanas.some((p) => p.id === ubicacion.seccion) ? ubicacion.seccion : "resumen";
  const clientes = relaciones?.clientes ?? [];

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <Link href={BASE} className="inline-flex min-h-10 items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden="true" size={16} />
        Procesos
      </Link>

      <CabeceraExpediente key={version} procesoId={procesoId} nombre={proceso?.nombre ?? ""} onCambio={recargar} />

      <div className="mt-6">
        <CaratulaTabs
          label="Secciones del expediente"
          value={activa}
          tabs={pestanas.map((p) => ({ ...p, href: `${BASE}/${procesoId}/${p.id}` }))}
          className="px-1"
        />
        <Sheet aria-label={pestanas.find((p) => p.id === activa)?.label} className="min-h-64 overflow-hidden rounded-tl-none">
          {!proceso || !relaciones ? (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-manila" />)}
            </div>
          ) : (
            <>
              {activa === "resumen" && <PanelResumen proceso={proceso} relaciones={relaciones} onCambio={recargar} />}
              {activa === "folios" && <FoliosExpediente key={`${ubicacion.folio ?? 0}-${version}`} procesoId={procesoId} folioInicial={ubicacion.folio ?? undefined} />}
              {activa === "relaciones" && <PanelRelaciones procesoId={procesoId} relaciones={relaciones} onRelaciones={(r) => { setRelaciones(r); setVersion((v) => v + 1); }} />}
              {activa === "agenda" && <PanelAgenda procesoId={procesoId} clientes={clientes} archivado={Boolean(proceso.archivado_en)} />}
              {activa === "tareas" && <PanelTareas procesoId={procesoId} />}
              {activa === "documentos" && <div className="p-4 sm:p-5"><DocumentosProceso procesoId={procesoId} hayClientes={clientes.length > 0} onCambio={recargar} /></div>}
              {activa === "contratos" && <PanelContratos procesoId={procesoId} contratoInicial={ubicacion.contrato} onCambio={recargar} />}
              {activa === "cobros" && <div className="p-4 sm:p-5"><CobrosProceso procesoId={procesoId} clienteUnico={clientes.length === 1 ? clientes[0].id : undefined} /></div>}
              {activa === "comunicaciones" && <PanelChat procesoId={procesoId} clientes={clientes} />}
              {activa === "equipo" && <PanelEquipo procesoId={procesoId} onCambio={recargar} />}
            </>
          )}
        </Sheet>
      </div>
    </div>
  );
}
