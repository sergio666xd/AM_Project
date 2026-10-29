"use client";

import { useId, useState } from "react";
import { Plus, Save, Send, Trash2 } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { CampoPesos, useClientesCobro } from "@/components/finanzas/campos";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, hoyISO, sumarDias } from "@/lib/fechas";
import { pesos, type DetalleCuenta } from "@/lib/finanzas";

type LineaForm = { clave: number; descripcion: string; cantidad: number; valor: number };

let siguiente = 0;
const lineaVacia = (): LineaForm => ({ clave: ++siguiente, descripcion: "", cantidad: 1, valor: 0 });
const PLAZO_DIAS = 15;

/**
 * Cuenta de cobro nueva, o la edición de un borrador. Se guarda como borrador
 * o se emite de una vez: al emitirla se numera y le llega al cliente con el PDF.
 */
export function CuentaFormModal({ open, onClose, onGuardada, borrador, clienteInicial, procesoInicial }: {
  open: boolean;
  onClose: () => void;
  onGuardada: (cuenta: DetalleCuenta) => void;
  borrador?: DetalleCuenta | null;
  clienteInicial?: number;
  procesoInicial?: number;
}) {
  const id = useId();
  const { toast } = useToast();
  const clientes = useClientesCobro(open);
  const inicial = () => ({
    clienteId: borrador ? String(borrador.cliente.id) : clienteInicial ? String(clienteInicial) : "",
    procesoId: borrador?.proceso ? String(borrador.proceso.id) : procesoInicial ? String(procesoInicial) : "",
    concepto: borrador?.concepto ?? "",
    lineas: borrador?.lineas.length
      ? borrador.lineas.map((l) => ({ clave: ++siguiente, descripcion: l.descripcion, cantidad: l.cantidad, valor: l.valor_unitario }))
      : [lineaVacia()],
    venceEl: borrador ? borrador.vence_el ?? "" : sumarDias(hoyISO(), PLAZO_DIAS),
  });
  const [form, setForm] = useState(inicial);
  const [abiertoCon, setAbiertoCon] = useState<number | null | undefined>(undefined);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<"borrador" | "emitir" | null>(null);

  // Al abrir para otro borrador (o para uno nuevo), el formulario arranca de cero.
  const llave = open ? borrador?.id ?? null : undefined;
  if (llave !== abiertoCon) {
    setAbiertoCon(llave);
    if (open) {
      setForm(inicial());
      setErrores({});
    }
  }

  const cliente = clientes?.find((c) => String(c.id) === form.clienteId);
  const total = form.lineas.reduce((suma, l) => suma + l.cantidad * l.valor, 0);
  const editando = Boolean(borrador);

  function cambiarLinea(clave: number, cambio: Partial<LineaForm>) {
    setForm((f) => ({ ...f, lineas: f.lineas.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)) }));
  }

  function validar(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!form.clienteId) e.cliente = "Elija a quién se le cobra.";
    if (!form.concepto.trim()) e.concepto = "Escriba por qué se cobra.";
    if (form.lineas.some((l) => !l.descripcion.trim())) e.lineas = "Cada línea necesita una descripción.";
    else if (total <= 0) e.lineas = "La cuenta tiene que sumar más de $0.";
    if (form.venceEl && form.venceEl < hoyISO()) e.vence = "La fecha de pago no puede haber pasado.";
    return e;
  }

  async function guardar(evento: { preventDefault: () => void }, emitir: boolean) {
    evento.preventDefault();
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(emitir ? "emitir" : "borrador");
    const cuerpo = {
      proceso_id: form.procesoId ? Number(form.procesoId) : null,
      concepto: form.concepto.trim(),
      lineas: form.lineas.map((l) => ({ descripcion: l.descripcion.trim(), cantidad: l.cantidad, valor_unitario: l.valor })),
      vence_el: form.venceEl || null,
    };
    let { data, error } = borrador
      ? await api.PUT("/api/v2/cuentas-cobro/{cuenta_id}", { params: { path: { cuenta_id: borrador.id } }, body: cuerpo })
      : await api.POST("/api/v2/cuentas-cobro", { body: { ...cuerpo, cliente_id: Number(form.clienteId), emitir } });
    if (data && borrador && emitir) {
      ({ data, error } = await api.POST("/api/v2/cuentas-cobro/{cuenta_id}/emitir", { params: { path: { cuenta_id: borrador.id } } }));
    }
    setGuardando(null);
    if (error || !data) {
      setErrores({ general: mensajeDeError(error) });
      return;
    }
    toast(emitir
      ? { title: `Cuenta ${data.numero} emitida`, description: `Le enviamos el PDF a ${data.cliente.nombre}.`, tone: "success" }
      : { title: "Borrador guardado", description: "Nadie más la ve hasta que la emita.", tone: "success" });
    onGuardada(data);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editando ? "Editar borrador" : "Nueva cuenta de cobro"}
      description="Al emitirla se numera y le llega al cliente por correo con el PDF."
    >
      <form onSubmit={(e) => void guardar(e, true)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Cliente</label>
            <select
              id={`${id}-cliente`}
              value={form.clienteId}
              disabled={!clientes || editando}
              onChange={(e) => {
                const elegido = clientes?.find((c) => String(c.id) === e.target.value);
                const conserva = procesoInicial && elegido?.procesos.some((p) => p.id === procesoInicial);
                setForm((f) => ({ ...f, clienteId: e.target.value, procesoId: conserva ? String(procesoInicial) : "" }));
              }}
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
            <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso <span className="font-normal text-ink-3">(opcional)</span></label>
            <select
              id={`${id}-proceso`}
              value={form.procesoId}
              disabled={!cliente || cliente.procesos.length === 0}
              onChange={(e) => setForm((f) => ({ ...f, procesoId: e.target.value }))}
              className={CAMPO}
            >
              <option value="">{!cliente ? "Elija primero el cliente" : cliente.procesos.length === 0 ? "No tiene procesos activos" : "General, sin proceso"}</option>
              {cliente?.procesos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>

        <label htmlFor={`${id}-concepto`} className={cx(ETIQUETA, "mt-4")}>Concepto</label>
        <input
          id={`${id}-concepto`}
          value={form.concepto}
          maxLength={255}
          onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
          placeholder="Ej.: Honorarios de la demanda ejecutiva"
          aria-invalid={errores.concepto ? true : undefined}
          aria-describedby={errores.concepto ? `${id}-concepto-error` : undefined}
          className={CAMPO}
        />
        {errores.concepto && <p id={`${id}-concepto-error`} className="mt-1.5 text-[13px] text-bad">{errores.concepto}</p>}

        <fieldset className="mt-5" aria-describedby={errores.lineas ? `${id}-lineas-error` : undefined}>
          <legend className={ETIQUETA}>Detalle</legend>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_4.5rem_9rem_7.5rem_2.5rem] gap-2 px-0.5 pb-1.5 text-[12px] font-semibold text-ink-3 sm:grid">
            <span>Descripción</span><span>Cant.</span><span className="text-right">Valor unitario</span><span className="text-right">Total</span><span />
          </div>
          <ol className="flex flex-col gap-3 sm:gap-2">
            {form.lineas.map((l, i) => (
              <li key={l.clave} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem] gap-2 rounded-xl bg-sheet-2 p-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_9rem_7.5rem_2.5rem] sm:items-center sm:bg-transparent sm:p-0">
                <input
                  aria-label={`Descripción de la línea ${i + 1}`}
                  value={l.descripcion}
                  maxLength={500}
                  onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                  placeholder="Qué se cobra"
                  className={cx(CAMPO, "col-span-3 sm:col-span-1")}
                />
                <input
                  aria-label={`Cantidad de la línea ${i + 1}`}
                  type="number"
                  min={1}
                  max={1000}
                  inputMode="numeric"
                  value={l.cantidad}
                  onChange={(e) => cambiarLinea(l.clave, { cantidad: Math.min(1000, Math.max(1, Math.trunc(Number(e.target.value) || 1))) })}
                  className={cx(CAMPO, "text-right tabular-nums")}
                />
                <CampoPesos aria-label={`Valor unitario de la línea ${i + 1}`} valor={l.valor} onValor={(valor) => cambiarLinea(l.clave, { valor })} placeholder="0" />
                <output className="col-span-2 self-center text-right text-[14px] tabular-nums text-ink-2 sm:col-span-1">
                  <span className="text-ink-3 sm:hidden">Total </span>{pesos(l.cantidad * l.valor)}
                </output>
                <button
                  type="button"
                  aria-label={`Quitar la línea ${i + 1}`}
                  disabled={form.lineas.length === 1}
                  onClick={() => setForm((f) => ({ ...f, lineas: f.lineas.filter((x) => x.clave !== l.clave) }))}
                  className="grid size-10 place-items-center justify-self-end rounded-lg text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad disabled:pointer-events-none disabled:opacity-40"
                >
                  <Trash2 aria-hidden="true" size={16} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ol>
          {errores.lineas && <p id={`${id}-lineas-error`} className="mt-1.5 text-[13px] text-bad">{errores.lineas}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={<Plus size={15} />}
              disabled={form.lineas.length >= 50}
              onClick={() => setForm((f) => ({ ...f, lineas: [...f.lineas, lineaVacia()] }))}
            >
              Agregar línea
            </Button>
            <p className="text-[14px] text-ink-2">Total <span className="ml-2 font-display text-[22px] tabular-nums text-ink">{pesos(total)}</span></p>
          </div>
        </fieldset>

        <div className="mt-4 sm:max-w-sm">
          <label htmlFor={`${id}-vence`} className={ETIQUETA}>Pagar a más tardar <span className="font-normal text-ink-3">(opcional)</span></label>
          <input
            id={`${id}-vence`}
            type="date"
            min={hoyISO()}
            value={form.venceEl}
            onChange={(e) => setForm((f) => ({ ...f, venceEl: e.target.value }))}
            aria-invalid={errores.vence ? true : undefined}
            aria-describedby={`${id}-vence-ayuda`}
            className={CAMPO}
          />
          <p id={`${id}-vence-ayuda`} className={cx("mt-1.5 text-[13px]", errores.vence ? "text-bad" : "text-ink-3")}>
            {errores.vence ?? (form.venceEl ? `Después del ${diaCorto(form.venceEl)} aparece como vencida.` : "Sin fecha, nunca aparece vencida.")}
          </p>
        </div>

        {errores.general && <p role="alert" className="mt-4 rounded-lg bg-bad-soft px-3 py-2.5 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center">
          <Button type="button" variant="ghost" onClick={onClose} className="sm:mr-auto">Cancelar</Button>
          <Button type="button" variant="secondary" icon={<Save size={16} />} loading={guardando === "borrador"} disabled={guardando === "emitir"} onClick={(e) => void guardar(e, false)}>
            Guardar borrador
          </Button>
          <Button type="submit" icon={<Send size={16} />} loading={guardando === "emitir"} disabled={guardando === "borrador"}>
            Emitir y enviar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
