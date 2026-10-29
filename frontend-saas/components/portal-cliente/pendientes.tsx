"use client";

import { useState } from "react";
import { Check, CheckCircle2, Download, FileUp, Paperclip, RotateCcw } from "lucide-react";

import { Button, clasesBoton } from "@/components/ui/Button";
import { Tag, type TonoTag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaLargo, fechaCorta } from "@/lib/fechas";
import {
  MAX_BYTES_ARCHIVO,
  TIPOS_ARCHIVO,
  anclaPendiente,
  primerNombre,
  tamanoLegible,
  type DetallePendiente,
  type HechoReciente,
  type PedidoDocumento,
} from "@/lib/portalCliente";

const ESTADO_PEDIDO: Record<PedidoDocumento["estado"], { texto: string; tono: TonoTag }> = {
  falta: { texto: "Falta", tono: "gold" },
  por_corregir: { texto: "Por corregir", tono: "bad" },
  no_aceptado: { texto: "No aceptado", tono: "bad" },
  en_revision: { texto: "En revisión", tono: "neutral" },
  aprobado: { texto: "Aprobado", tono: "ok" },
};

const ESTADO_HECHO: Record<HechoReciente["estado"], { texto: string; tono: TonoTag }> = {
  en_revision: { texto: "La firma lo está revisando", tono: "neutral" },
  aprobado: { texto: "Aprobado", tono: "ok" },
  hecha: { texto: "Hecho", tono: "ok" },
};

function cuandoVence(pendiente: DetallePendiente): string {
  if (!pendiente.vence) return "Sin fecha límite";
  return pendiente.vencido ? `Venció el ${diaLargo(pendiente.vence)}` : `Antes del ${diaLargo(pendiente.vence)}`;
}

/** Una cosa que la firma le pidió al cliente, con lo necesario para resolverla ahí mismo. */
export function TarjetaPendiente({ pendiente, conProceso, resaltado, onCambio }: {
  pendiente: DetallePendiente;
  conProceso: boolean;
  resaltado: boolean;
  onCambio: () => void;
}) {
  const quien = primerNombre(pendiente.pedido_por.nombre);
  return (
    <li
      id={anclaPendiente(pendiente.clave)}
      className={cx(
        "scroll-mt-24 overflow-hidden rounded-2xl bg-sheet shadow-sheet transition-shadow duration-500",
        resaltado && "ring-2 ring-gold",
      )}
    >
      <div className="px-5 py-5 sm:px-7">
        {conProceso && <p className="mb-1 text-[15px] text-ink-3">{pendiente.proceso.nombre}</p>}
        <h2 className="font-display text-[22px] leading-snug text-ink [text-wrap:balance]">{pendiente.titulo}</h2>
        <p className="mt-1 text-[15px] text-ink-2">
          <span className={cx(pendiente.vencido && "font-semibold text-bad")}>{cuandoVence(pendiente)}</span>
          <span className="text-ink-3"> · Lo pidió {pendiente.pedido_por.nombre}</span>
        </p>
        {pendiente.tarea && <p className="mt-1 text-[15px] text-ink-3">Es parte de «{pendiente.tarea}»</p>}
        {pendiente.instrucciones && (
          <div className="mt-4 rounded-xl bg-manila px-4 py-3">
            <p className="text-[14px] font-semibold text-ink-2">Indicaciones de {quien}</p>
            <p className="mt-1 whitespace-pre-line text-[16px] text-ink [text-wrap:pretty]">{pendiente.instrucciones}</p>
          </div>
        )}
      </div>
      {pendiente.tipo === "documento" ? (
        <ul className="divide-y divide-line border-t border-line">
          {(pendiente.pedidos ?? []).map((pedido) => (
            <FilaPedido key={pedido.id} solicitudId={Number(pendiente.clave.split(":")[1])} pedido={pedido} onEnviado={onCambio} />
          ))}
        </ul>
      ) : (
        <MarcarHecha pendiente={pendiente} onHecha={onCambio} />
      )}
    </li>
  );
}

function FilaPedido({ solicitudId, pedido, onEnviado }: { solicitudId: number; pedido: PedidoDocumento; onEnviado: () => void }) {
  const { toast } = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const estado = ESTADO_PEDIDO[pedido.estado];
  const corregir = pedido.estado === "por_corregir" || pedido.estado === "no_aceptado";

  function elegir(lista: FileList | null) {
    const elegido = lista?.[0] ?? null;
    setError(null);
    if (elegido && elegido.size > MAX_BYTES_ARCHIVO) {
      setArchivo(null);
      setError(`«${elegido.name}» pesa ${tamanoLegible(elegido.size)}. El máximo es 15 MB.`);
      return;
    }
    setArchivo(elegido);
  }

  async function enviar() {
    if (!archivo) return;
    setEnviando(true);
    setError(null);
    const formulario = new FormData();
    formulario.append("archivo", archivo);
    const { error: fallo } = await api.POST("/api/v2/cliente/solicitudes/{solicitud_id}/pedidos/{pedido_id}/archivo", {
      params: { path: { solicitud_id: solicitudId, pedido_id: pedido.id } },
      // openapi-fetch envía un FormData tal cual y el navegador pone el límite multipart.
      body: formulario as unknown as { archivo: string },
    });
    setEnviando(false);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: "Documento enviado", description: `Recibimos «${archivo.name}». Le avisaremos cuando lo revisemos.`, tone: "success" });
    setArchivo(null);
    onEnviado();
  }

  return (
    <li className="px-5 py-4 sm:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-ink">{pedido.nombre}</span>
            <Tag tone={estado.tono} className="h-7 px-2.5 text-[13px]">{estado.texto}</Tag>
          </p>
          {pedido.nota && (
            <p className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-[15px] text-ink">
              <span className="font-semibold">Por qué lo devolvimos:</span> {pedido.nota}
            </p>
          )}
          {pedido.archivo && (
            <a
              href={pedido.archivo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded text-[15px] text-navy-ink hover:underline"
            >
              <Download aria-hidden="true" size={16} className="shrink-0" />
              <span className="truncate">{corregir ? "Lo que envió:" : "Envió:"} {pedido.archivo.nombre}</span>
            </a>
          )}
        </div>
        {pedido.puede_enviar && !archivo && (
          <label
            className={cx(
              clasesBoton("primary", "lg"),
              "w-full cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy sm:w-auto",
            )}
          >
            <input type="file" accept={TIPOS_ARCHIVO} className="sr-only" onChange={(e) => { elegir(e.target.files); e.target.value = ""; }} />
            <FileUp aria-hidden="true" size={18} />
            {corregir ? "Enviar la corrección" : "Elegir archivo"}
          </label>
        )}
      </div>
      {archivo && (
        <div className="motion-fade-in mt-3 flex flex-col gap-3 rounded-xl bg-sheet-2 p-3 ring-1 ring-line sm:flex-row sm:items-center">
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-ink sm:flex-1">
            <Paperclip aria-hidden="true" size={16} className="shrink-0 text-ink-3" />
            <span className="truncate">{archivo.name}</span>
            <span className="shrink-0 text-ink-3 tabular-nums">{tamanoLegible(archivo.size)}</span>
          </p>
          <div className="flex gap-2">
            <label className={cx(clasesBoton("ghost", "lg"), "cursor-pointer focus-within:outline-2 focus-within:outline-navy")}>
              <input type="file" accept={TIPOS_ARCHIVO} className="sr-only" onChange={(e) => { elegir(e.target.files); e.target.value = ""; }} />
              <RotateCcw aria-hidden="true" size={16} /> Cambiar
            </label>
            <Button size="lg" loading={enviando} onClick={() => void enviar()} className="flex-1 sm:flex-none" icon={<Check aria-hidden="true" size={18} />}>
              Enviar
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-[15px] text-bad">{error}</p>}
    </li>
  );
}

function MarcarHecha({ pendiente, onHecha }: { pendiente: DetallePendiente; onHecha: () => void }) {
  const { toast } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipo, id] = pendiente.clave.split(":");

  async function marcar() {
    setEnviando(true);
    setError(null);
    const { error: fallo } = tipo === "subtarea"
      ? await api.POST("/api/v2/cliente/subtareas/{subtarea_id}/hecha", { params: { path: { subtarea_id: Number(id) } } })
      : await api.POST("/api/v2/cliente/tareas/{tarea_id}/hecha", { params: { path: { tarea_id: Number(id) } } });
    setEnviando(false);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: "¡Listo, gracias!", description: `Le avisamos a ${primerNombre(pendiente.pedido_por.nombre)} que ya lo hizo.`, tone: "success" });
    onHecha();
  }

  return (
    <div className="border-t border-line bg-sheet-2 px-5 py-4 sm:px-7">
      {confirmando ? (
        <div className="motion-fade-in flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-[16px] text-ink sm:flex-1">¿Confirma que ya lo hizo? Le avisaremos a {primerNombre(pendiente.pedido_por.nombre)}.</p>
          <div className="flex gap-2">
            <Button size="lg" variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>Todavía no</Button>
            <Button size="lg" loading={enviando} onClick={() => void marcar()} className="flex-1 sm:flex-none" icon={<Check aria-hidden="true" size={18} />}>
              Sí, ya lo hice
            </Button>
          </div>
        </div>
      ) : (
        <Button size="lg" onClick={() => setConfirmando(true)} className="w-full sm:w-auto" icon={<CheckCircle2 aria-hidden="true" size={18} />}>
          Ya lo hice
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-[15px] text-bad">{error}</p>}
    </div>
  );
}

/** Lo que el cliente ya entregó o hizo hace poco: constancia de que llegó. */
export function HechosRecientes({ hechos, conProceso }: { hechos: HechoReciente[]; conProceso: boolean }) {
  return (
    <section aria-labelledby="ya-enviado">
      <h2 id="ya-enviado" className="mb-3 font-display text-[22px] text-ink">Lo que ya nos envió</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-sheet shadow-sheet">
        {hechos.map((hecho) => {
          const estado = ESTADO_HECHO[hecho.estado];
          return (
            <li key={hecho.clave} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-7">
              <div className="min-w-0 sm:flex-1">
                <p className="text-ink">{hecho.titulo}</p>
                <p className="text-[15px] text-ink-3">
                  {fechaCorta(hecho.fecha)}
                  {conProceso && ` · ${hecho.proceso.nombre}`}
                </p>
              </div>
              <Tag tone={estado.tono} className="h-7 self-start px-2.5 text-[13px] sm:self-center">{estado.texto}</Tag>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
