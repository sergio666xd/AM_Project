"use client";

import { useId, useState } from "react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { CampoPesos } from "@/components/finanzas/campos";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cx } from "@/lib/cx";

/**
 * Confirmación que pide el motivo, para lo que deja rastro: anular una cuenta
 * o revertir un pago. `onConfirmar` devuelve el mensaje de error, si lo hubo.
 */
export function MotivoModal({ open, onClose, titulo, descripcion, etiqueta, confirmar, onConfirmar }: {
  open: boolean;
  onClose: () => void;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  confirmar: string;
  onConfirmar: (motivo: string) => Promise<string | null>;
}) {
  const id = useId();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cerrar() {
    setMotivo("");
    setError(null);
    onClose();
  }

  async function enviar(evento: { preventDefault: () => void }) {
    evento.preventDefault();
    if (motivo.trim().length < 3) {
      setError("Escriba el motivo; queda en el historial.");
      return;
    }
    setGuardando(true);
    const fallo = await onConfirmar(motivo.trim());
    setGuardando(false);
    if (fallo) setError(fallo);
    else cerrar();
  }

  return (
    <Modal open={open} onClose={cerrar} size="sm" title={titulo} description={descripcion}>
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <label htmlFor={`${id}-motivo`} className={ETIQUETA}>{etiqueta}</label>
        <textarea
          id={`${id}-motivo`}
          rows={3}
          maxLength={1000}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx(CAMPO, "resize-y py-2.5")}
        />
        {error && <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={guardando}>{confirmar}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Descuento o cargo sobre una cuenta emitida, con su motivo. */
export function AjusteModal({ open, onClose, saldo, onGuardar }: {
  open: boolean;
  onClose: () => void;
  saldo: number;
  onGuardar: (datos: { tipo: "descuento" | "cargo"; importe: number; motivo: string }) => Promise<string | null>;
}) {
  const id = useId();
  const [tipo, setTipo] = useState<"descuento" | "cargo">("descuento");
  const [importe, setImporte] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  function cerrar() {
    setTipo("descuento");
    setImporte(0);
    setMotivo("");
    setErrores({});
    onClose();
  }

  async function enviar(evento: { preventDefault: () => void }) {
    evento.preventDefault();
    const e: Record<string, string> = {};
    if (importe <= 0) e.importe = "Escriba el valor.";
    else if (tipo === "descuento" && importe > saldo) e.importe = "El descuento no puede pasar del saldo.";
    if (motivo.trim().length < 3) e.motivo = "Escriba el motivo; el cliente lo ve en la cuenta.";
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    const fallo = await onGuardar({ tipo, importe, motivo: motivo.trim() });
    setGuardando(false);
    if (fallo) setErrores({ general: fallo });
    else cerrar();
  }

  return (
    <Modal open={open} onClose={cerrar} size="sm" title="Agregar un ajuste" description="Cambia el saldo sin tocar el detalle de la cuenta emitida.">
      <form onSubmit={(e) => void enviar(e)} noValidate>
        <fieldset>
          <legend className={ETIQUETA}>Tipo</legend>
          <div className="grid grid-cols-2 gap-2">
            {([["descuento", "Descuento", "Resta del saldo"], ["cargo", "Cargo", "Suma al saldo"]] as const).map(([valor, nombre, ayuda]) => (
              <label
                key={valor}
                className={cx(
                  "flex cursor-pointer flex-col rounded-lg px-3 py-2.5 transition-shadow",
                  tipo === valor ? "bg-navy-soft shadow-[0_0_0_2px_var(--navy)]" : "bg-sheet shadow-[0_0_0_1px_var(--line-strong)] hover:shadow-[0_0_0_1px_var(--ink-3)]",
                )}
              >
                <input type="radio" name={`${id}-tipo`} value={valor} checked={tipo === valor} onChange={() => setTipo(valor)} className="sr-only" />
                <span className="text-[14px] font-semibold text-ink">{nombre}</span>
                <span className="text-[12.5px] text-ink-3">{ayuda}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label htmlFor={`${id}-importe`} className={cx(ETIQUETA, "mt-4")}>Valor</label>
        <CampoPesos
          id={`${id}-importe`}
          valor={importe}
          onValor={setImporte}
          placeholder="0"
          aria-invalid={errores.importe ? true : undefined}
          aria-describedby={errores.importe ? `${id}-importe-error` : undefined}
        />
        {errores.importe && <p id={`${id}-importe-error`} className="mt-1.5 text-[13px] text-bad">{errores.importe}</p>}
        <label htmlFor={`${id}-motivo`} className={cx(ETIQUETA, "mt-4")}>Motivo</label>
        <textarea
          id={`${id}-motivo`}
          rows={2}
          maxLength={1000}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={tipo === "descuento" ? "Ej.: Descuento acordado por pago anticipado" : "Ej.: Gastos de notificación"}
          aria-invalid={errores.motivo ? true : undefined}
          aria-describedby={errores.motivo ? `${id}-motivo-error` : undefined}
          className={cx(CAMPO, "resize-y py-2.5")}
        />
        {errores.motivo && <p id={`${id}-motivo-error`} className="mt-1.5 text-[13px] text-bad">{errores.motivo}</p>}
        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando}>Agregar {tipo}</Button>
        </div>
      </form>
    </Modal>
  );
}
