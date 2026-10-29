"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Wallet } from "lucide-react";

import { CuentaFormModal } from "@/components/finanzas/CuentaFormModal";
import { DetalleCuentaDrawer } from "@/components/finanzas/DetalleCuentaDrawer";
import { PagoModal } from "@/components/finanzas/PagoModal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { diaCorto, fechaCorta } from "@/lib/fechas";
import { estadoVisible, pesos, type Cuenta, type DetalleCuenta } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

/** Pestaña Cobros del expediente: las cuentas de este proceso y su saldo. */
export function CobrosProceso({ procesoId, clienteUnico }: { procesoId: number; clienteUnico?: number }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [abierta, setAbierta] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<{ borrador?: DetalleCuenta } | null>(null);
  const [pago, setPago] = useState<{ clienteId: number; cuentaId: number } | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    const { data, error: fallo } = await api.GET("/api/v2/cuentas-cobro", { params: { query: { filtro: "todas", proceso_id: procesoId } } });
    if (fallo || !data) setError(mensajeDeError(fallo));
    else setCuentas(data.items);
    void version;
  }, [procesoId, version]);
  useLoadEffect(cargar);
  const recargar = () => setVersion((v) => v + 1);

  const vigentes = (cuentas ?? []).filter((c) => c.estado !== "anulada" && c.estado !== "borrador");
  const porCobrar = vigentes.reduce((s, c) => s + c.saldo, 0);
  const pagado = vigentes.reduce((s, c) => s + c.pagado, 0);
  const orden = [...(cuentas ?? [])].sort((a, b) => (b.emitida_en ?? b.creada_en).localeCompare(a.emitida_en ?? a.creada_en));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[21px] text-ink">Cobros</h2>
          {cuentas && cuentas.length > 0 && (
            <p className="mt-0.5 text-[14px] tabular-nums text-ink-2">
              {pesos(porCobrar)} por cobrar · {pesos(pagado)} pagado
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gestion-procesos/abogado/cobros" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-navy-ink transition-colors hover:bg-manila">
            <Wallet aria-hidden="true" size={16} strokeWidth={1.75} /> Todos los cobros
          </Link>
          <Button icon={<Plus size={16} />} onClick={() => setFormulario({})}>Nueva cuenta</Button>
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-bad-soft px-4 py-3 text-bad">
            <p className="flex-1 text-[14px]">{error}</p>
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} onClick={() => void cargar()}>Reintentar</Button>
          </div>
        ) : !cuentas ? (
          <div aria-busy="true" className="h-28 animate-pulse rounded-xl bg-sheet-2" />
        ) : cuentas.length === 0 ? (
          <EmptyState icon={Wallet} title="Este proceso aún no tiene cuentas de cobro" description="Al emitir una, el cliente la recibe por correo con el PDF y la ve en su portal." />
        ) : (
          <ul className="divide-y divide-line rounded-xl shadow-[0_0_0_1px_var(--line)]">
            {orden.map((c) => {
              const e = estadoVisible(c);
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setAbierta(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-manila/60">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{c.concepto}</span>
                        <Tag tone={e.tono}>{e.nombre}</Tag>
                      </span>
                      <span className="block text-[12.5px] tabular-nums text-ink-3">
                        {c.numero ?? "Borrador"} · {c.cliente.nombre} · {c.estado === "borrador" ? `creada el ${fechaCorta(c.creada_en)}` : c.vence_el ? `${c.vencida ? "venció" : "vence"} el ${diaCorto(c.vence_el)}` : `emitida el ${fechaCorta(c.emitida_en ?? c.creada_en)}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block whitespace-nowrap text-[14px] font-semibold tabular-nums text-ink">{pesos(c.estado === "borrador" ? c.total : c.estado === "anulada" ? 0 : c.saldo)}</span>
                      {c.pagado > 0 && <span className="block whitespace-nowrap text-[12.5px] tabular-nums text-ink-3">de {pesos(c.total + c.ajustes)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DetalleCuentaDrawer
        cuentaId={abierta}
        version={version}
        onClose={() => setAbierta(null)}
        onCambio={recargar}
        onEditar={(borrador) => setFormulario({ borrador })}
        onRegistrarPago={(c) => setPago({ clienteId: c.cliente.id, cuentaId: c.id })}
      />
      <CuentaFormModal
        open={formulario !== null}
        borrador={formulario?.borrador}
        clienteInicial={clienteUnico}
        procesoInicial={procesoId}
        onClose={() => setFormulario(null)}
        onGuardada={(c) => { recargar(); setAbierta(c.id); }}
      />
      <PagoModal
        open={pago !== null}
        clienteInicial={pago?.clienteId}
        cuentaInicial={pago?.cuentaId}
        onClose={() => setPago(null)}
        onRegistrado={recargar}
      />
    </div>
  );
}
