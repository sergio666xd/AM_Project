"use client";

import { useCallback, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaCorta } from "@/lib/fechas";
import { METODO_PAGO, abrirEstadoDeCuenta, estadoVisible, pesos } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Estado = Esquemas["EstadoDeCuenta"];

/** Lo que un cliente ha recibido en cuentas, lo que ha pagado y lo que debe. */
export function EstadoCuentaDrawer({ clienteId, onClose, onAbrirCuenta }: {
  clienteId: number | null;
  onClose: () => void;
  onAbrirCuenta: (id: number) => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (clienteId === null) return;
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/estado-cuenta", { params: { query: { cliente_id: clienteId } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setEstado(data);
  }, [clienteId]);
  useLoadEffect(cargar);

  const visible = estado && estado.cliente.id === clienteId ? estado : null;
  const t = visible?.totales;

  return (
    <Drawer
      open={clienteId !== null}
      onClose={onClose}
      width="lg"
      overline="Estado de cuenta"
      title={visible?.cliente.nombre ?? (error ? "No se pudo abrir" : "Cargando…")}
      footer={clienteId !== null && (
        <>
          <Button variant="secondary" icon={<Download size={16} />} onClick={() => abrirEstadoDeCuenta(clienteId, true)}>Descargar PDF</Button>
          <Button icon={<FileText size={16} />} onClick={() => abrirEstadoDeCuenta(clienteId)}>Ver PDF</Button>
        </>
      )}
    >
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
          <p className="flex-1 text-[14px]">{error}</p>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
        </div>
      ) : !visible || !t ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-sheet-2" />
          <div className="h-48 animate-pulse rounded-xl bg-sheet-2" />
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-sheet-2 px-4 py-4">
            <p className="text-[13px] text-ink-3">Saldo por pagar</p>
            <p className="font-display text-[32px] leading-tight tabular-nums text-ink">{pesos(t.saldo)}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              <div><dt className="text-ink-3">Cobrado</dt><dd className="tabular-nums text-ink">{pesos(t.cobrado)}</dd></div>
              <div><dt className="text-ink-3">Pagado</dt><dd className="tabular-nums text-ink">{pesos(t.pagado)}</dd></div>
              <div><dt className="text-ink-3">Vencido</dt><dd className={cx("tabular-nums", t.vencido ? "font-semibold text-bad" : "text-ink")}>{pesos(t.vencido)}</dd></div>
              <div><dt className="text-ink-3">A favor</dt><dd className={cx("tabular-nums", t.a_favor ? "font-semibold text-gold-ink" : "text-ink")}>{pesos(t.a_favor)}</dd></div>
            </dl>
          </div>

          <section className="mt-6">
            <h3 className="text-[13px] font-semibold text-ink-2">Cuentas</h3>
            {visible.cuentas.length === 0 ? (
              <p className="mt-2 text-[14px] text-ink-3">Aún no tiene cuentas emitidas.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {visible.cuentas.map((c) => {
                  const e = estadoVisible(c);
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => onAbrirCuenta(c.id)} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-manila">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tabular-nums text-ink">{c.numero}</span>
                            <Tag tone={e.tono}>{e.nombre}</Tag>
                          </span>
                          <span className="block truncate text-[13px] text-ink-2">{c.concepto}</span>
                        </span>
                        <span className="text-right">
                          <span className="block text-[14px] tabular-nums text-ink">{pesos(c.estado === "anulada" ? 0 : c.saldo)}</span>
                          <span className="block text-[12.5px] tabular-nums text-ink-3">de {pesos(c.total + c.ajustes)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-6">
            <h3 className="text-[13px] font-semibold text-ink-2">Pagos</h3>
            {visible.pagos.length === 0 ? (
              <p className="mt-2 text-[14px] text-ink-3">Aún no hay pagos registrados.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {visible.pagos.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold tabular-nums text-ink">{p.numero_recibo}</span>
                      <span className="block text-[12.5px] text-ink-3">
                        {METODO_PAGO[p.metodo]} · {diaCorto(p.pagado_el)}{p.revertido ? ` · revertido` : ""}
                      </span>
                    </span>
                    <span className={cx("text-[14px] tabular-nums", p.revertido ? "text-ink-3 line-through" : "text-ink")}>{pesos(p.importe)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="mt-6 text-[12.5px] text-ink-3">Al {fechaCorta(new Date())}. El PDF es el mismo que el cliente puede descargar en su portal.</p>
        </>
      )}
    </Drawer>
  );
}
