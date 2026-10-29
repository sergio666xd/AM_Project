"use client";

import { useCallback, useState } from "react";
import { Download, Eye, FileText, RefreshCw, Send } from "lucide-react";

import { ListaSolicitudes } from "@/components/documentos/ListaSolicitudes";
import { SolicitarDocumentosModal } from "@/components/documentos/SolicitarDocumentosModal";
import { VisorDocumento } from "@/components/documentos/VisorDocumento";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { descargarArchivo, tipoDeArchivo, type Archivo, type Solicitud } from "@/lib/documentos";
import { fechaRelativa } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

/** Pestaña Documentos del expediente: las solicitudes al cliente y los demás archivos del proceso. */
export function DocumentosProceso({ procesoId, hayClientes, onCambio }: {
  procesoId: number;
  hayClientes: boolean;
  onCambio?: () => void;
}) {
  const { toast } = useToast();
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null);
  const [otros, setOtros] = useState<Archivo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    const [respuestaSolicitudes, respuestaArchivos] = await Promise.all([
      api.GET("/api/v2/documentos/solicitudes", { params: { query: { grupo: "todas", proceso_id: procesoId } } }),
      api.GET("/api/v2/documentos", { params: { query: { grupo: "todos", proceso_id: procesoId } } }),
    ]);
    const fallo = respuestaSolicitudes.error ?? respuestaArchivos.error;
    if (fallo || !respuestaSolicitudes.data || !respuestaArchivos.data) {
      setError(mensajeDeError(fallo));
      return;
    }
    setSolicitudes(respuestaSolicitudes.data.items);
    setOtros(respuestaArchivos.data.items.filter((a) => !a.solicitud));
  }, [procesoId]);
  useLoadEffect(cargar);

  function recargar() {
    void cargar();
    onCambio?.();
  }

  async function descargar(archivo: Archivo) {
    try {
      await descargarArchivo(archivo);
    } catch (causa) {
      toast({ title: "No se pudo descargar", description: causa instanceof Error ? causa.message : undefined, tone: "error" });
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-[19px] text-ink">Documentos</h2>
          <p className="text-[13px] text-ink-3">
            {solicitudes ? `${solicitudes.length} ${solicitudes.length === 1 ? "solicitud" : "solicitudes"} · ${otros.length} ${otros.length === 1 ? "archivo" : "archivos"} sin solicitud` : "Cargando…"}
          </p>
        </div>
        <Button size="sm" icon={<Send size={14} />} disabled={!hayClientes} title={hayClientes ? undefined : "Vincula un cliente al proceso para pedirle documentos."} onClick={() => setPidiendo(true)}>
          Pedir documentos
        </Button>
      </header>

      <div className="space-y-6 p-4 sm:p-5">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !solicitudes ? (
          <div className="h-40 animate-pulse rounded-[var(--radius-lg)] bg-manila" aria-label="Cargando documentos" />
        ) : (
          <>
            <section aria-labelledby="solicitudes-proceso">
              <h3 id="solicitudes-proceso" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Solicitudes al cliente</h3>
              {solicitudes.length ? (
                <ListaSolicitudes solicitudes={solicitudes} conProceso={false} onVer={setViendo} onCambio={recargar} />
              ) : (
                <p className="rounded-[var(--radius-lg)] px-4 py-6 text-center text-[14px] text-ink-3 shadow-[inset_0_0_0_1px_var(--line)]">
                  {hayClientes ? "Aún no le has pedido documentos al cliente." : "Vincula un cliente al proceso para pedirle documentos."}
                </p>
              )}
            </section>

            {otros.length > 0 && (
              <section aria-labelledby="otros-proceso">
                <h3 id="otros-proceso" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">Otros documentos</h3>
                <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] bg-sheet shadow-[0_0_0_1px_var(--line)]">
                  {otros.map((archivo) => (
                    <li key={archivo.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <FileText aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{archivo.nombre}</p>
                        <p className="text-[12.5px] text-ink-3">{tipoDeArchivo(archivo.tipo_archivo)} · {fechaRelativa(archivo.recibido_en)}{archivo.cliente && ` · ${archivo.cliente.nombre}`}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => setViendo(archivo.id)}>Ver</Button>
                        <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => void descargar(archivo)} aria-label={`Descargar ${archivo.nombre}`}>Descargar</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p className="text-[13px] text-ink-3">Los contratos firmados están en la pestaña Contratos.</p>
          </>
        )}
      </div>

      <VisorDocumento documentoId={viendo} onClose={() => setViendo(null)} onRevisado={recargar} />
      <SolicitarDocumentosModal open={pidiendo} onClose={() => setPidiendo(false)} procesoInicial={procesoId} onCreada={recargar} />
    </div>
  );
}
