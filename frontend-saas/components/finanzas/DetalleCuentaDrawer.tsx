"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Ban, Download, FileText, HandCoins, Pencil, RefreshCw, Send, SlidersHorizontal, Trash2 } from "lucide-react";

import { AjusteModal, MotivoModal } from "@/components/finanzas/MotivoModal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaConHora, fechaCorta } from "@/lib/fechas";
import { METODO_PAGO, abrirPdfCuenta, abrirRecibo, estadoVisible, pesos, type DetalleCuenta } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[13px] font-semibold text-ink-2">{titulo}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * Ficha de una cuenta de cobro: el detalle, los abonos, los ajustes y los
 * envíos al cliente, con lo que se puede hacer según su estado.
 */
export function DetalleCuentaDrawer({ cuentaId, version = 0, onClose, onCambio, onEditar, onRegistrarPago }: {
  cuentaId: number | null;
  /** Cambia cuando la página registra algo que afecta a la cuenta, para recargarla. */
  version?: number;
  onClose: () => void;
  onCambio: () => void;
  onEditar: (cuenta: DetalleCuenta) => void;
  onRegistrarPago: (cuenta: DetalleCuenta) => void;
}) {
  const { toast } = useToast();
  const [cuenta, setCuenta] = useState<DetalleCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accion, setAccion] = useState<"emitir" | "reenviar" | null>(null);
  const [dialogo, setDialogo] = useState<"anular" | "ajuste" | "descartar" | null>(null);

  const cargar = useCallback(async () => {
    if (cuentaId === null) return;
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cuentas-cobro/{cuenta_id}", { params: { path: { cuenta_id: cuentaId } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setCuenta(data);
    void version;
  }, [cuentaId, version]);
  useLoadEffect(cargar);

  const visible = cuenta && cuenta.id === cuentaId ? cuenta : null;
  const ruta = { params: { path: { cuenta_id: cuentaId ?? 0 } } };

  function actualizar(nueva: DetalleCuenta) {
    setCuenta(nueva);
    onCambio();
  }

  async function emitir() {
    setAccion("emitir");
    const { data, error: fallo } = await api.POST("/api/v2/cuentas-cobro/{cuenta_id}/emitir", ruta);
    setAccion(null);
    if (fallo || !data) return toast({ title: "No se pudo emitir", description: mensajeDeError(fallo), tone: "error" });
    actualizar(data);
    toast({ title: `Cuenta ${data.numero} emitida`, description: `Le enviamos el PDF a ${data.cliente.nombre}.`, tone: "success" });
  }

  async function reenviar() {
    setAccion("reenviar");
    const { data, error: fallo } = await api.POST("/api/v2/cuentas-cobro/{cuenta_id}/reenviar", ruta);
    setAccion(null);
    if (fallo || !data) return toast({ title: "No se pudo reenviar", description: mensajeDeError(fallo), tone: "error" });
    if (data.estado === "error") toast({ title: "El correo no salió", description: data.error ?? "Revise la dirección del cliente.", tone: "error" });
    else toast({ title: "Cuenta reenviada", description: `Va a ${data.destinatario}.`, tone: "success" });
    void cargar();
  }

  async function descartar() {
    const { error: fallo } = await api.DELETE("/api/v2/cuentas-cobro/{cuenta_id}", ruta);
    if (fallo) return toast({ title: "No se pudo descartar", description: mensajeDeError(fallo), tone: "error" });
    toast({ title: "Borrador descartado", tone: "success" });
    onCambio();
    onClose();
  }

  const abierta = visible && (visible.estado === "pendiente" || visible.estado === "parcial");
  const estado = visible ? estadoVisible(visible) : null;
  const subtotal = visible ? visible.lineas.reduce((s, l) => s + l.total, 0) : 0;

  let pie: ReactNode = null;
  if (visible?.estado === "borrador") {
    pie = (
      <>
        <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setDialogo("descartar")} className="mr-auto">Descartar</Button>
        <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => onEditar(visible)}>Editar</Button>
        <Button icon={<Send size={16} />} loading={accion === "emitir"} onClick={() => void emitir()}>Emitir y enviar</Button>
      </>
    );
  } else if (visible) {
    pie = (
      <>
        <Button variant="secondary" icon={<FileText size={16} />} onClick={() => abrirPdfCuenta(visible.id)}>Ver PDF</Button>
        {abierta && <Button icon={<HandCoins size={16} />} onClick={() => onRegistrarPago(visible)}>Registrar pago</Button>}
      </>
    );
  }

  return (
    <>
      <Drawer
        open={cuentaId !== null}
        onClose={onClose}
        width="lg"
        overline={visible ? (visible.numero ?? "Borrador sin número") : "Cuenta de cobro"}
        title={visible?.concepto ?? (error ? "No se pudo abrir" : "Cargando…")}
        subtitle={visible && <>{visible.cliente.nombre}{visible.proceso ? ` · ${visible.proceso.nombre}` : ""}</>}
        footer={pie}
      >
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !visible || !estado ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <div className="h-24 animate-pulse rounded-xl bg-sheet-2" />
            <div className="h-40 animate-pulse rounded-xl bg-sheet-2" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl bg-sheet-2 px-4 py-4">
              <div>
                <Tag tone={estado.tono}>{estado.nombre}</Tag>
                <p className="mt-2 text-[13px] text-ink-3">{visible.estado === "borrador" ? "Total a cobrar" : visible.estado === "pagada" ? "Pagada por completo" : visible.estado === "anulada" ? "Sin saldo" : "Saldo por pagar"}</p>
                <p className={cx("font-display text-[32px] leading-tight tabular-nums", visible.estado === "anulada" ? "text-ink-3 line-through" : "text-ink")}>
                  {pesos(visible.estado === "borrador" ? visible.total : visible.estado === "pagada" ? visible.pagado : visible.saldo)}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                <dt className="text-ink-3">{visible.emitida_en ? "Emitida" : "Creada"}</dt>
                <dd className="text-right tabular-nums text-ink-2">{fechaCorta(visible.emitida_en ?? visible.creada_en)}</dd>
                <dt className="text-ink-3">Pagar antes del</dt>
                <dd className={cx("text-right tabular-nums", visible.vencida ? "font-semibold text-bad" : "text-ink-2")}>{visible.vence_el ? diaCorto(visible.vence_el) : "Sin fecha"}</dd>
                <dt className="text-ink-3">A favor de</dt>
                <dd className="text-right text-ink-2">{visible.abogado.nombre}</dd>
              </dl>
            </div>

            {visible.estado === "anulada" && (
              <p className="mt-4 rounded-lg bg-manila px-3.5 py-3 text-[13.5px] text-ink-2">
                <span className="font-semibold text-ink">Anulada{visible.anulada_en ? ` el ${fechaCorta(visible.anulada_en)}` : ""}.</span>{" "}
                {visible.motivo_anulacion}
              </p>
            )}

            <Seccion titulo="Detalle">
              <table className="w-full text-[14px]">
                <thead className="sr-only">
                  <tr><th>Descripción</th><th>Valor</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 align-top text-ink">
                        {l.descripcion}
                        {l.cantidad > 1 && <span className="block text-[12.5px] tabular-nums text-ink-3">{l.cantidad} × {pesos(l.valor_unitario)}</span>}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right align-top tabular-nums text-ink">{pesos(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-[13.5px]">
                  {(visible.ajustes !== 0 || visible.pagado > 0) && (
                    <tr className="border-t border-line-strong">
                      <td className="pt-2.5 text-ink-2">Subtotal</td>
                      <td className="pt-2.5 text-right tabular-nums text-ink-2">{pesos(subtotal)}</td>
                    </tr>
                  )}
                  {visible.ajustes !== 0 && (
                    <tr>
                      <td className="pt-1 text-ink-2">Ajustes</td>
                      <td className="whitespace-nowrap pt-1 text-right tabular-nums text-ink-2">{visible.ajustes > 0 ? "+" : ""}{pesos(visible.ajustes)}</td>
                    </tr>
                  )}
                  {visible.pagado > 0 && (
                    <tr>
                      <td className="pt-1 text-ink-2">Abonado</td>
                      <td className="whitespace-nowrap pt-1 text-right tabular-nums text-ok">{pesos(-visible.pagado)}</td>
                    </tr>
                  )}
                  <tr className={cx(visible.ajustes === 0 && visible.pagado === 0 && "border-t border-line-strong")}>
                    <td className="pt-2 font-semibold text-ink">{visible.ajustes === 0 && visible.pagado === 0 ? "Total" : "Saldo"}</td>
                    <td className="pt-2 text-right font-semibold tabular-nums text-ink">{pesos(visible.ajustes === 0 && visible.pagado === 0 ? visible.total : visible.saldo)}</td>
                  </tr>
                </tfoot>
              </table>
            </Seccion>

            {visible.aplicaciones.length > 0 && (
              <Seccion titulo="Abonos">
                <ul className="divide-y divide-line">
                  {visible.aplicaciones.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className={cx("text-[14px] tabular-nums", a.revertido ? "text-ink-3 line-through" : "text-ink")}>{pesos(a.importe)}</p>
                        <p className="text-[12.5px] text-ink-3">
                          {METODO_PAGO[a.metodo]} · {diaCorto(a.pagado_el)}{a.revertido ? " · pago revertido" : ""}
                        </p>
                      </div>
                      {a.numero_recibo && (
                        <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={() => abrirRecibo(a.pago_id)}>{a.numero_recibo}</Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            {visible.ajustes_detalle.length > 0 && (
              <Seccion titulo="Ajustes">
                <ul className="divide-y divide-line">
                  {visible.ajustes_detalle.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink">{a.motivo}</p>
                        <p className="text-[12.5px] text-ink-3">{a.tipo === "descuento" ? "Descuento" : "Cargo"} · {fechaCorta(a.creado_en)}{a.por ? ` · ${a.por}` : ""}</p>
                      </div>
                      <p className="whitespace-nowrap text-[14px] tabular-nums text-ink">{a.tipo === "descuento" ? pesos(-a.importe) : `+${pesos(a.importe)}`}</p>
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            {visible.entregas.length > 0 && (
              <Seccion titulo="Envíos al cliente">
                <ul className="divide-y divide-line">
                  {visible.entregas.map((e) => (
                    <li key={e.id} className="flex items-start gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-ink">{e.destinatario}</p>
                        <p className={cx("text-[12.5px]", e.estado === "error" ? "text-bad" : "text-ink-3")}>
                          {fechaConHora(e.creado_en)}{e.estado === "error" && e.error ? ` · ${e.error}` : ""}
                        </p>
                      </div>
                      <Tag tone={e.estado === "error" ? "bad" : "ok"}>{e.estado === "error" ? "No salió" : "Enviado"}</Tag>
                    </li>
                  ))}
                </ul>
              </Seccion>
            )}

            {visible.estado !== "borrador" && (
              <Seccion titulo="Más acciones">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => abrirPdfCuenta(visible.id, true)}>Descargar PDF</Button>
                  {visible.estado !== "anulada" && (
                    <Button size="sm" variant="secondary" icon={<Send size={14} />} loading={accion === "reenviar"} onClick={() => void reenviar()}>Reenviar al cliente</Button>
                  )}
                  {abierta && <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={() => setDialogo("ajuste")}>Agregar ajuste</Button>}
                  {abierta && <Button size="sm" variant="danger" icon={<Ban size={14} />} onClick={() => setDialogo("anular")}>Anular</Button>}
                </div>
              </Seccion>
            )}
            {visible.estado === "borrador" && (
              <p className="mt-6 text-[13px] text-ink-3">
                Es un borrador: el cliente no lo ve.{" "}
                <button type="button" onClick={() => abrirPdfCuenta(visible.id)} className="font-semibold text-navy-ink underline-offset-2 hover:underline">Ver cómo queda el PDF</button>
              </p>
            )}
          </>
        )}
      </Drawer>

      <MotivoModal
        open={dialogo === "anular"}
        onClose={() => setDialogo(null)}
        titulo={`Anular ${visible?.numero ?? "la cuenta"}`}
        descripcion="Deja de contar en el saldo del cliente. Si ya tiene abonos, primero revierta esos pagos."
        etiqueta="Por qué se anula"
        confirmar="Anular la cuenta"
        onConfirmar={async (motivo) => {
          const { data, error: fallo } = await api.POST("/api/v2/cuentas-cobro/{cuenta_id}/anular", { ...ruta, body: { motivo } });
          if (fallo || !data) return mensajeDeError(fallo);
          actualizar(data);
          toast({ title: `${data.numero} anulada`, tone: "success" });
          return null;
        }}
      />
      <AjusteModal
        open={dialogo === "ajuste"}
        onClose={() => setDialogo(null)}
        saldo={visible?.saldo ?? 0}
        onGuardar={async (body) => {
          const { data, error: fallo } = await api.POST("/api/v2/cuentas-cobro/{cuenta_id}/ajustes", { ...ruta, body });
          if (fallo || !data) return mensajeDeError(fallo);
          actualizar(data);
          toast({ title: body.tipo === "descuento" ? "Descuento agregado" : "Cargo agregado", description: `El saldo queda en ${pesos(data.saldo)}.`, tone: "success" });
          return null;
        }}
      />
      <ConfirmDialog
        open={dialogo === "descartar"}
        onClose={() => setDialogo(null)}
        onConfirm={descartar}
        destructive
        title="¿Descartar este borrador?"
        description="Se borra del todo. Como nunca se emitió, el cliente no lo vio."
        confirmLabel="Descartar"
      />
    </>
  );
}
