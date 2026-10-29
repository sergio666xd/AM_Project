"use client";

import { useState } from "react";

import { CambiarFechaModal, TarjetaSolicitud } from "@/components/documentos/TarjetaSolicitud";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import type { Solicitud } from "@/lib/documentos";
import { diaCorto } from "@/lib/fechas";

/** Las tarjetas de solicitudes con sus acciones: recordar, cambiar la fecha y eliminar. */
export function ListaSolicitudes({ solicitudes, conProceso = true, onVer, onCambio }: {
  solicitudes: Solicitud[];
  conProceso?: boolean;
  onVer: (documentoId: number) => void;
  onCambio: () => void;
}) {
  const { toast } = useToast();
  const [conFecha, setConFecha] = useState<Solicitud | null>(null);
  const [eliminar, setEliminar] = useState<Solicitud | null>(null);

  async function recordar(solicitud: Solicitud) {
    const { error } = await api.POST("/api/v2/documentos/solicitudes/{solicitud_id}/recordar", { params: { path: { solicitud_id: solicitud.id } } });
    if (error) toast({ title: "No se envió el recordatorio", description: mensajeDeError(error), tone: "error" });
    else toast({ title: "Recordatorio enviado", description: `${solicitud.cliente.nombre} recibió un aviso con lo que le falta.`, tone: "success" });
    onCambio();
  }

  async function cambiarFecha(fecha: string | null): Promise<string | null> {
    if (!conFecha) return null;
    const { error } = await api.PATCH("/api/v2/documentos/solicitudes/{solicitud_id}", {
      params: { path: { solicitud_id: conFecha.id } },
      body: { fecha_limite: fecha },
    });
    if (error) return mensajeDeError(error);
    toast({ title: fecha ? `Nueva fecha límite: ${diaCorto(fecha)}` : "Sin fecha límite", tone: "success" });
    onCambio();
    return null;
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {solicitudes.map((solicitud) => (
          <TarjetaSolicitud
            key={solicitud.id}
            solicitud={solicitud}
            conProceso={conProceso}
            onVer={onVer}
            onRecordar={recordar}
            onCambiarFecha={setConFecha}
            onEliminar={setEliminar}
          />
        ))}
      </div>
      <CambiarFechaModal solicitud={conFecha} onClose={() => setConFecha(null)} onGuardar={cambiarFecha} />
      <ConfirmDialog
        open={eliminar !== null}
        onClose={() => setEliminar(null)}
        destructive
        title="¿Eliminar la solicitud?"
        description={eliminar ? `${eliminar.cliente.nombre} deja de ver «${eliminar.titulo}». Lo que ya entregó se queda en el proceso.` : ""}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          if (!eliminar) return;
          const { error } = await api.DELETE("/api/v2/documentos/solicitudes/{solicitud_id}", { params: { path: { solicitud_id: eliminar.id } } });
          if (error) throw new Error(mensajeDeError(error));
          toast({ title: "Solicitud eliminada", tone: "success" });
          setEliminar(null);
          onCambio();
        }}
      />
    </>
  );
}
