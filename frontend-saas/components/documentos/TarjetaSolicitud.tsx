"use client";

import { useId, useState, type FormEvent } from "react";
import { BellRing, CalendarClock, Eye, Trash2 } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import { Tag } from "@/components/ui/Tag";
import { cx } from "@/lib/cx";
import { ESTADO_SOLICITUD, estadoDocumento, plazo, type Solicitud } from "@/lib/documentos";
import { fechaRelativa, hoyISO } from "@/lib/fechas";

/**
 * Una solicitud de documentos: qué se pidió, qué ha entregado el cliente y cómo va
 * la fecha límite. `conProceso` muestra el proceso (en la página de Documentos).
 */
export function TarjetaSolicitud({ solicitud, conProceso = true, onVer, onRecordar, onCambiarFecha, onEliminar }: {
  solicitud: Solicitud;
  conProceso?: boolean;
  onVer: (documentoId: number) => void;
  onRecordar: (solicitud: Solicitud) => Promise<void>;
  onCambiarFecha: (solicitud: Solicitud) => void;
  onEliminar: (solicitud: Solicitud) => void;
}) {
  const [recordando, setRecordando] = useState(false);
  const total = solicitud.pedidos.length;
  const estado = ESTADO_SOLICITUD[solicitud.estado];
  const vence = plazo(solicitud, hoyISO());
  const esperando = solicitud.estado === "esperando_cliente";

  async function recordar() {
    setRecordando(true);
    try {
      await onRecordar(solicitud);
    } finally {
      setRecordando(false);
    }
  }

  return (
    <article
      id={`solicitud-${solicitud.id}`}
      className={cx(
        "scroll-mt-24 rounded-[var(--radius-lg)] bg-sheet p-4 shadow-[0_0_0_1px_var(--line),0_1px_2px_rgb(24_32_58/0.05)] sm:p-5",
        solicitud.vencida && "shadow-[inset_3px_0_0_var(--bad),0_0_0_1px_var(--line)]",
      )}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-pretty text-ink">{solicitud.titulo}</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {solicitud.cliente.nombre}
            {conProceso && <> · {solicitud.proceso.nombre}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {vence ? <Tag tone={vence.tono}>{vence.texto}</Tag> : <Tag tone={estado.tono}>{estado.nombre}</Tag>}
          <RowActionsMenu
            row={solicitud}
            label={`Más acciones de «${solicitud.titulo}»`}
            actions={[
              { label: solicitud.fecha_limite ? "Cambiar la fecha límite" : "Poner fecha límite", icon: <CalendarClock size={16} />, hidden: () => solicitud.estado === "completa", onSelect: onCambiarFecha },
              { label: "Eliminar la solicitud", icon: <Trash2 size={16} />, tone: "danger", separated: true, onSelect: onEliminar },
            ]}
          />
        </div>
      </header>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-manila" aria-hidden="true">
          <div
            className={cx("h-full rounded-full transition-[width] duration-300", solicitud.estado === "completa" ? "bg-ok" : "bg-navy")}
            style={{ width: `${(solicitud.entregados / Math.max(1, total)) * 100}%` }}
          />
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-ink-2">{solicitud.entregados} de {total} entregados</span>
      </div>

      <ul className="mt-3 divide-y divide-line">
        {solicitud.pedidos.map((pedido) => {
          const marca = estadoDocumento(pedido.estado);
          return (
            <li key={pedido.id} className="flex min-h-11 items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 text-[14px] text-ink">
                {pedido.nombre}
                {pedido.versiones > 1 && <span className="ml-1.5 whitespace-nowrap text-[12.5px] tabular-nums text-ink-3">{pedido.versiones} versiones</span>}
              </span>
              <Tag tone={marca.tono}>{marca.nombre}</Tag>
              {pedido.archivo_id ? (
                <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => onVer(pedido.archivo_id!)} aria-label={`Ver ${pedido.nombre}`}>
                  Ver
                </Button>
              ) : (
                // Mantiene alineada la columna de estados.
                <span aria-hidden="true" className="w-[3.75rem] shrink-0" />
              )}
            </li>
          );
        })}
      </ul>

      {esperando && (
        <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <Button size="sm" variant="secondary" icon={<BellRing size={14} />} loading={recordando} disabled={!solicitud.puede_recordar} onClick={() => void recordar()}>
            Recordarle
          </Button>
          <span className="text-[13px] text-ink-3">
            {solicitud.ultimo_recordatorio_en
              ? `Último recordatorio: ${fechaRelativa(solicitud.ultimo_recordatorio_en).toLowerCase()}`
              : `Pedida ${fechaRelativa(solicitud.creada_en).toLowerCase()}`}
          </span>
        </footer>
      )}
    </article>
  );
}

/** Cambiar o quitar la fecha límite de una solicitud. */
export function CambiarFechaModal({ solicitud, onClose, onGuardar }: {
  solicitud: Solicitud | null;
  onClose: () => void;
  onGuardar: (fecha: string | null) => Promise<string | null>;
}) {
  const id = useId();
  const [fecha, setFecha] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<"guardar" | "quitar" | null>(null);
  const valor = fecha ?? solicitud?.fecha_limite ?? "";

  function cerrar() {
    setFecha(null);
    setError(null);
    onClose();
  }

  async function guardar(nueva: string | null, accion: "guardar" | "quitar") {
    setGuardando(accion);
    const fallo = await onGuardar(nueva);
    setGuardando(null);
    if (fallo) setError(fallo);
    else cerrar();
  }

  function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!valor) {
      setError("Elige una fecha.");
      return;
    }
    void guardar(valor, "guardar");
  }

  return (
    <Modal open={solicitud !== null} onClose={cerrar} size="sm" title="Fecha límite" description={solicitud ? `«${solicitud.titulo}» para ${solicitud.cliente.nombre}.` : undefined}>
      <form onSubmit={enviar} noValidate>
        <label htmlFor={`${id}-fecha`} className={ETIQUETA}>Nueva fecha</label>
        <input id={`${id}-fecha`} type="date" min={hoyISO()} value={valor} onChange={(e) => setFecha(e.target.value)} aria-invalid={error ? true : undefined} className={CAMPO} />
        <p className="mt-1.5 text-[13px] text-ink-3">{error ? <span role="alert" className="text-bad">{error}</span> : "El cliente ve la fecha nueva en su portal."}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {solicitud?.fecha_limite && (
            <Button type="button" variant="ghost" className="sm:mr-auto" loading={guardando === "quitar"} onClick={() => void guardar(null, "quitar")}>Quitar la fecha</Button>
          )}
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando === "guardar"}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
