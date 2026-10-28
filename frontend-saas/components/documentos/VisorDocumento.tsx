"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, Download, FileText, RefreshCw, Undo2 } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { descargarArchivo, estadoDocumento, obtenerArchivo, porRevisar, tipoDeArchivo, type Archivo, type Version } from "@/lib/documentos";
import { fechaConHora } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

/**
 * Un documento a pantalla grande: la vista previa (PDF o imagen), sus versiones y,
 * si lo entregó el cliente, aprobarlo o devolverlo para corregir.
 */
export function VisorDocumento({ documentoId, onClose, onRevisado }: {
  documentoId: number | null;
  onClose: () => void;
  onRevisado?: (archivo: Archivo) => void;
}) {
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    if (documentoId === null) return;
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/documentos/{documento_id}", { params: { path: { documento_id: documentoId } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else {
      setArchivo(data);
      // Se abre en la versión pedida (desde una versión anterior del historial, por ejemplo).
      setElegida(data.versiones.some((v) => v.id === documentoId) ? documentoId : data.id);
    }
  }, [documentoId]);
  useLoadEffect(cargar);

  function cerrar() {
    setArchivo(null);
    setElegida(null);
    setError(null);
    onClose();
  }

  const version = archivo?.versiones.find((v) => v.id === elegida) ?? archivo?.versiones[0] ?? null;
  const esVigente = version !== null && version.id === archivo?.id;

  return (
    <Modal
      open={documentoId !== null}
      onClose={cerrar}
      size="xl"
      title={archivo?.nombre ?? "Documento"}
      description={archivo ? [archivo.cliente?.nombre ?? (archivo.entregado_por_cliente ? null : "Documento de la firma"), archivo.proceso.nombre].filter(Boolean).join(" · ") : undefined}
    >
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !archivo || !version ? (
        <div className="h-[60vh] animate-pulse rounded-xl bg-manila" aria-label="Cargando documento" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <VistaPrevia key={version.id} version={version} />
          <aside className="flex min-w-0 flex-col gap-5">
            {archivo.entregado_por_cliente && esVigente && (
              <Revision archivo={archivo} onRevisado={(nuevo) => { setArchivo(nuevo); setElegida(nuevo.id); onRevisado?.(nuevo); }} />
            )}
            <section aria-labelledby="versiones-titulo">
              <h3 id="versiones-titulo" className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                {archivo.versiones.length === 1 ? "Versión" : `${archivo.versiones.length} versiones`}
              </h3>
              <ol className="mt-2 space-y-1.5">
                {archivo.versiones.map((v) => (
                  <li key={v.id}>
                    <ItemVersion version={v} vigente={v.id === archivo.id} elegida={v.id === version.id} onElegir={() => setElegida(v.id)} />
                  </li>
                ))}
              </ol>
            </section>
            {archivo.solicitud && (
              <p className="text-[13px] text-ink-3">Responde a la solicitud «{archivo.solicitud.titulo}».</p>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

function ItemVersion({ version, vigente, elegida, onElegir }: { version: Version; vigente: boolean; elegida: boolean; onElegir: () => void }) {
  const estado = estadoDocumento(version.estado_revision);
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-current={elegida ? "true" : undefined}
      className={cx(
        "block w-full rounded-lg px-3 py-2.5 text-left transition-[background-color,box-shadow] duration-150",
        elegida ? "bg-navy-soft shadow-[inset_0_0_0_1px_var(--navy)]" : "hover:bg-manila",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold text-ink">Versión {version.numero}{vigente && <span className="font-normal text-ink-3"> · vigente</span>}</span>
        <Tag tone={estado.tono}>{estado.nombre}</Tag>
      </span>
      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{version.nombre_archivo}</span>
      <span className="block text-[12.5px] tabular-nums text-ink-3">{fechaConHora(version.recibido_en)}</span>
      {version.comentario && (
        <span className="mt-1.5 block text-[13px] text-pretty text-ink-2">«{version.comentario}»{version.revisado_por && <span className="text-ink-3"> · {version.revisado_por}</span>}</span>
      )}
    </button>
  );
}

function VistaPrevia({ version }: { version: Version }) {
  const { toast } = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!version.vista_previa) return;
    let vigente = true;
    let creada: string | null = null;
    obtenerArchivo(version.id)
      .then((blob) => {
        if (!vigente) return;
        creada = URL.createObjectURL(blob);
        setUrl(creada);
      })
      .catch((causa: unknown) => { if (vigente) setError(causa instanceof Error ? causa.message : "No se pudo abrir el archivo."); });
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL(creada);
    };
  }, [version.id, version.vista_previa]);

  async function descargar() {
    setDescargando(true);
    try {
      await descargarArchivo(version);
    } catch (causa) {
      toast({ title: "No se pudo descargar", description: causa instanceof Error ? causa.message : undefined, tone: "error" });
    } finally {
      setDescargando(false);
    }
  }

  const esImagen = version.tipo_archivo.startsWith("image/");
  return (
    <div className="min-w-0">
      <div className="relative h-[52vh] overflow-hidden rounded-xl bg-manila shadow-[inset_0_0_0_1px_var(--line)] lg:h-[68vh]">
        {!version.vista_previa ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <FileText aria-hidden="true" className="mx-auto size-10 text-ink-3" strokeWidth={1.5} />
              <p className="mt-3 font-semibold text-ink">{tipoDeArchivo(version.tipo_archivo)}: no se puede ver aquí</p>
              <p className="mt-1 text-[14px] text-ink-3">Descárgalo para abrirlo en tu computador.</p>
            </div>
          </div>
        ) : error ? (
          <p role="alert" className="grid h-full place-items-center p-6 text-center text-[14px] text-bad">{error}</p>
        ) : !url ? (
          <div className="h-full animate-pulse" aria-label="Cargando vista previa" />
        ) : esImagen ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob local, sin optimizar
          <img src={url} alt={`Vista previa de ${version.nombre_archivo}`} className="size-full object-contain" />
        ) : (
          <iframe src={url} title={`Vista previa de ${version.nombre_archivo}`} className="size-full border-0 bg-sheet" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-ink-3">{version.nombre_archivo}</p>
        <Button size="sm" variant="secondary" icon={<Download size={14} />} loading={descargando} onClick={() => void descargar()}>Descargar</Button>
      </div>
    </div>
  );
}

function Revision({ archivo, onRevisado }: { archivo: Archivo; onRevisado: (archivo: Archivo) => void }) {
  const id = useId();
  const { toast } = useToast();
  const [devolviendo, setDevolviendo] = useState(false);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"APROBADO" | "REQUIERE_CORRECCION" | null>(null);
  const vigente = archivo.versiones[0];

  async function revisar(estado: "APROBADO" | "REQUIERE_CORRECCION") {
    if (estado === "REQUIERE_CORRECCION" && !comentario.trim()) {
      setError("Dile al cliente qué debe corregir.");
      return;
    }
    setEnviando(estado);
    setError(null);
    const { data, error: fallo } = await api.PATCH("/api/v2/documentos/{documento_id}/revision", {
      params: { path: { documento_id: archivo.id } },
      body: { estado, comentario: comentario.trim() || null },
    });
    setEnviando(null);
    if (fallo || !data) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({
      title: estado === "APROBADO" ? "Documento aprobado" : "Devuelto al cliente",
      description: estado === "APROBADO" ? undefined : "Le avisamos qué debe corregir.",
      tone: "success",
    });
    setDevolviendo(false);
    setComentario("");
    onRevisado(data);
  }

  if (!porRevisar(archivo.estado_revision)) {
    const aprobado = archivo.estado_revision === "APROBADO";
    return (
      <div className={cx("rounded-xl px-4 py-3 text-[14px]", aprobado ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
        <p className="font-semibold">{aprobado ? "Aprobado" : "Devuelto para corregir"}</p>
        <p className="mt-0.5 text-[13px] opacity-90">
          {[vigente.revisado_por, vigente.revisado_en && fechaConHora(vigente.revisado_en)].filter(Boolean).join(" · ")}
          {!aprobado && ". Esperando una nueva versión del cliente."}
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl bg-gold-soft/60 p-4 shadow-[inset_0_0_0_1px_var(--line)]">
      <h3 id={`${id}-titulo`} className="font-semibold text-ink">¿Sirve este documento?</h3>
      <p className="mt-0.5 text-[13px] text-ink-2">El cliente recibe un aviso con tu respuesta.</p>
      {devolviendo ? (
        <div className="mt-3">
          <label htmlFor={`${id}-comentario`} className={ETIQUETA}>Qué debe corregir</label>
          <textarea
            id={`${id}-comentario`}
            rows={3}
            maxLength={4000}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej.: La foto está borrosa; envía la cédula por ambas caras."
            aria-invalid={error ? true : undefined}
            className={cx(CAMPO, "resize-y py-2.5")}
            autoFocus
          />
          {error && <p role="alert" className="mt-1.5 text-[13px] text-bad">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<Undo2 size={14} />} loading={enviando === "REQUIERE_CORRECCION"} onClick={() => void revisar("REQUIERE_CORRECCION")}>Devolver al cliente</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDevolviendo(false); setError(null); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          {error && <p role="alert" className="mt-2 text-[13px] text-bad">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={<Check size={14} />} loading={enviando === "APROBADO"} onClick={() => void revisar("APROBADO")}>Aprobar</Button>
            <Button size="sm" variant="secondary" icon={<Undo2 size={14} />} onClick={() => setDevolviendo(true)}>Pedir corrección</Button>
          </div>
        </>
      )}
    </section>
  );
}
