"use client";

import { useCallback, useId, useState } from "react";
import { HandCoins, RotateCcw } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { CampoPesos, useClientesCobro } from "@/components/finanzas/campos";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, hoyISO } from "@/lib/fechas";
import { METODO_PAGO, estadoVisible, pesos, repartir, type Cuenta, type MetodoPago, type Pago } from "@/lib/finanzas";
import { useLoadEffect } from "@/lib/useLoadEffect";

const METODOS = Object.entries(METODO_PAGO) as [MetodoPago, string][];

function nuevaClave(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `pago-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Registra un pago recibido por fuera del portal y lo abona a las cuentas
 * abiertas del cliente, de la más antigua a la más nueva. Con `pago`, abona lo
 * que ese pago tiene a favor. La clave evita duplicarlo si se envía dos veces.
 */
export function PagoModal({ open, onClose, onRegistrado, clienteInicial, cuentaInicial, pago }: {
  open: boolean;
  onClose: () => void;
  onRegistrado: (pago: Pago) => void;
  clienteInicial?: number;
  cuentaInicial?: number;
  pago?: Pago | null;
}) {
  const id = useId();
  const { toast } = useToast();
  const clientes = useClientesCobro(open && !pago);
  const [clienteId, setClienteId] = useState("");
  const [importe, setImporte] = useState(0);
  const [pagadoEl, setPagadoEl] = useState(hoyISO);
  const [metodo, setMetodo] = useState<MetodoPago>("transferencia");
  const [referencia, setReferencia] = useState("");
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [ajustes, setAjustes] = useState<Record<number, number> | null>(null);
  const [clave, setClave] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [abiertoCon, setAbiertoCon] = useState<string | null>(null);

  // Cada apertura empieza limpia y con una clave nueva.
  const llave = open ? `${pago?.id ?? "nuevo"}-${clienteInicial ?? ""}-${cuentaInicial ?? ""}` : null;
  if (llave !== abiertoCon) {
    setAbiertoCon(llave);
    if (open) {
      setClienteId(pago ? String(pago.cliente.id) : clienteInicial ? String(clienteInicial) : "");
      setImporte(0);
      setPagadoEl(hoyISO());
      setMetodo("transferencia");
      setReferencia("");
      setCuentas(null);
      setAjustes(null);
      setClave(nuevaClave());
      setErrores({});
    }
  }

  const cargarCuentas = useCallback(async () => {
    if (!open || !clienteId) return;
    const { data } = await api.GET("/api/v2/cuentas-cobro", { params: { query: { filtro: "por_cobrar", cliente_id: Number(clienteId) } } });
    setCuentas(data?.items ?? []);
  }, [open, clienteId]);
  useLoadEffect(cargarCuentas);

  const disponible = pago ? pago.disponible : importe;
  const ordenadas = cuentas ? [...cuentas].sort((a, b) => (a.id === cuentaInicial ? -1 : b.id === cuentaInicial ? 1 : 0)) : [];
  const automatico = cuentaInicial
    ? (() => {
        const primera = ordenadas.find((c) => c.id === cuentaInicial);
        const resto = repartir(Math.max(0, disponible - (primera ? Math.min(disponible, primera.saldo) : 0)), ordenadas.filter((c) => c.id !== cuentaInicial));
        return primera ? { ...resto, [primera.id]: Math.min(disponible, primera.saldo) } : resto;
      })()
    : repartir(disponible, ordenadas);
  const reparto = ajustes ?? automatico;
  const abonado = ordenadas.reduce((suma, c) => suma + (reparto[c.id] ?? 0), 0);
  const aFavor = disponible - abonado;
  const excedida = ordenadas.find((c) => (reparto[c.id] ?? 0) > c.saldo);

  async function guardar(evento: { preventDefault: () => void }) {
    evento.preventDefault();
    const e: Record<string, string> = {};
    if (!pago) {
      if (!clienteId) e.cliente = "Elija quién pagó.";
      if (importe <= 0) e.importe = "Escriba cuánto pagó.";
      if (!pagadoEl) e.fecha = "Elija el día del pago.";
      else if (pagadoEl > hoyISO()) e.fecha = "El pago no puede ser de un día futuro.";
    }
    if (excedida) e.reparto = `El abono a ${excedida.numero} supera su saldo de ${pesos(excedida.saldo)}.`;
    else if (aFavor < 0) e.reparto = "Lo abonado supera el valor del pago.";
    else if (pago && abonado <= 0) e.reparto = "Escriba cuánto abonar a cada cuenta.";
    setErrores(e);
    if (Object.keys(e).length) return;

    setGuardando(true);
    const aplicaciones = ordenadas.filter((c) => (reparto[c.id] ?? 0) > 0).map((c) => ({ cuenta_id: c.id, importe: reparto[c.id] }));
    const { data, error } = pago
      ? await api.POST("/api/v2/pagos/{pago_id}/aplicaciones", { params: { path: { pago_id: pago.id } }, body: aplicaciones })
      : await api.POST("/api/v2/pagos", {
          body: { cliente_id: Number(clienteId), importe, metodo, referencia: referencia.trim() || null, pagado_el: pagadoEl, clave, aplicaciones },
        });
    setGuardando(false);
    if (error || !data) {
      setErrores({ general: mensajeDeError(error), ...(error && "campos" in error ? error.campos : {}) });
      return;
    }
    toast(pago
      ? { title: "Abono registrado", description: data.disponible ? `Quedan ${pesos(data.disponible)} a favor.` : "El pago quedó abonado por completo.", tone: "success" }
      : { title: `Pago registrado · ${data.numero_recibo}`, description: `Le enviamos el recibo a ${data.cliente.nombre}.`, tone: "success" });
    onRegistrado(data);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={pago ? "Abonar el saldo a favor" : "Registrar un pago"}
      description={pago
        ? `${pago.numero_recibo} de ${pago.cliente.nombre} tiene ${pesos(pago.disponible)} sin abonar.`
        : "Un pago que llegó por transferencia, consignación o en efectivo. El cliente recibe el recibo por correo."}
    >
      <form onSubmit={(e) => void guardar(e)} noValidate>
        {!pago && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Quién pagó</label>
                <select
                  id={`${id}-cliente`}
                  value={clienteId}
                  disabled={!clientes}
                  onChange={(e) => { setClienteId(e.target.value); setCuentas(null); setAjustes(null); }}
                  aria-invalid={errores.cliente ? true : undefined}
                  aria-describedby={errores.cliente ? `${id}-cliente-error` : undefined}
                  className={CAMPO}
                >
                  <option value="">{clientes ? "Elija el cliente" : "Cargando clientes…"}</option>
                  {clientes?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                {errores.cliente && <p id={`${id}-cliente-error`} className="mt-1.5 text-[13px] text-bad">{errores.cliente}</p>}
              </div>
              <div>
                <label htmlFor={`${id}-importe`} className={ETIQUETA}>Valor recibido</label>
                <CampoPesos
                  id={`${id}-importe`}
                  valor={importe}
                  onValor={(v) => { setImporte(v); setAjustes(null); }}
                  placeholder="0"
                  aria-invalid={errores.importe ? true : undefined}
                  aria-describedby={errores.importe ? `${id}-importe-error` : undefined}
                />
                {errores.importe && <p id={`${id}-importe-error`} className="mt-1.5 text-[13px] text-bad">{errores.importe}</p>}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor={`${id}-fecha`} className={ETIQUETA}>Día del pago</label>
                <input
                  id={`${id}-fecha`}
                  type="date"
                  max={hoyISO()}
                  value={pagadoEl}
                  onChange={(e) => setPagadoEl(e.target.value)}
                  aria-invalid={errores.fecha || errores.pagado_el ? true : undefined}
                  aria-describedby={errores.fecha || errores.pagado_el ? `${id}-fecha-error` : undefined}
                  className={CAMPO}
                />
                {(errores.fecha || errores.pagado_el) && <p id={`${id}-fecha-error`} className="mt-1.5 text-[13px] text-bad">{errores.fecha ?? errores.pagado_el}</p>}
              </div>
              <div>
                <label htmlFor={`${id}-metodo`} className={ETIQUETA}>Cómo pagó</label>
                <select id={`${id}-metodo`} value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className={CAMPO}>
                  {METODOS.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-referencia`} className={ETIQUETA}>Referencia <span className="font-normal text-ink-3">(opcional)</span></label>
                <input id={`${id}-referencia`} value={referencia} maxLength={120} onChange={(e) => setReferencia(e.target.value)} placeholder="N.º de la transacción" className={CAMPO} />
              </div>
            </div>
          </>
        )}

        <fieldset className={cx(!pago && "mt-6")} aria-describedby={errores.reparto || errores.aplicaciones ? `${id}-reparto-error` : undefined}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <legend className="text-[15px] font-semibold text-ink">A qué cuentas se abona</legend>
            {ajustes && (
              <Button type="button" size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setAjustes(null)}>
                Repartir de nuevo
              </Button>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-3">Repartido de la más antigua a la más nueva. Puede cambiar cada valor.</p>

          <div className="mt-3">
            {!clienteId ? (
              <p className="rounded-xl bg-sheet-2 px-4 py-5 text-center text-[14px] text-ink-3">Elija el cliente para ver sus cuentas por cobrar.</p>
            ) : !cuentas ? (
              <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-sheet-2" />
            ) : ordenadas.length === 0 ? (
              <p className="rounded-xl bg-sheet-2 px-4 py-5 text-center text-[14px] text-ink-3">
                No tiene cuentas por cobrar. Todo el pago queda a favor y puede abonarlo después.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl shadow-[0_0_0_1px_var(--line)]">
                {ordenadas.map((c) => {
                  const estado = estadoVisible(c);
                  return (
                    <li key={c.id} className="grid grid-cols-1 items-center gap-2.5 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_9.5rem] sm:gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold tabular-nums text-ink">{c.numero}</span>
                          <Tag tone={estado.tono}>{estado.nombre}</Tag>
                        </p>
                        <p className="truncate text-[13px] text-ink-2" title={c.concepto}>{c.concepto}</p>
                        <p className="text-[12.5px] tabular-nums text-ink-3">
                          Saldo {pesos(c.saldo)}{c.vence_el ? ` · vence el ${diaCorto(c.vence_el)}` : ""}
                        </p>
                      </div>
                      <CampoPesos
                        aria-label={`Abono a ${c.numero}`}
                        valor={reparto[c.id] ?? 0}
                        onValor={(v) => setAjustes({ ...reparto, [c.id]: v })}
                        placeholder="0"
                        aria-invalid={(reparto[c.id] ?? 0) > c.saldo ? true : undefined}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {(errores.reparto || errores.aplicaciones) && (
            <p id={`${id}-reparto-error`} className="mt-1.5 text-[13px] text-bad">{errores.reparto ?? errores.aplicaciones}</p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-sheet-2 px-4 py-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-ink-3">{pago ? "Por abonar" : "Recibido"}</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-ink">{pesos(disponible)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Abonado a cuentas</dt>
              <dd className="mt-0.5 text-[16px] font-semibold tabular-nums text-ink">{pesos(abonado)}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-ink-3">{aFavor < 0 ? "Sobrepasa el pago" : "Queda a favor"}</dt>
              <dd className={cx("mt-0.5 text-[16px] font-semibold tabular-nums", aFavor < 0 ? "text-bad" : aFavor > 0 ? "text-gold-ink" : "text-ink")}>{pesos(Math.abs(aFavor))}</dd>
            </div>
          </dl>
        </fieldset>

        {errores.general && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" icon={<HandCoins size={16} />} loading={guardando}>
            {pago ? "Abonar" : "Registrar y enviar el recibo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
