"use client";

import { useCallback, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Plus, Send, X } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import type { Solicitud } from "@/lib/documentos";
import { diaCorto, hoyISO, sumarDias } from "@/lib/fechas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Proceso = Esquemas["ProcesoResumen"];

const PLAZOS = [
  { dias: 3, nombre: "En 3 días" },
  { dias: 7, nombre: "En una semana" },
  { dias: 15, nombre: "En 15 días" },
];
const MAXIMO = 30;

/** Pedirle al cliente uno o varios documentos, con fecha límite opcional. */
export function SolicitarDocumentosModal({ open, onClose, onCreada, procesoInicial }: {
  open: boolean;
  onClose: () => void;
  onCreada: (solicitud: Solicitud) => void;
  procesoInicial?: number;
}) {
  const id = useId();
  const { toast } = useToast();
  const lista = useRef<HTMLOListElement>(null);
  const [procesos, setProcesos] = useState<Proceso[] | null>(null);
  const [procesoId, setProcesoId] = useState(procesoInicial ? String(procesoInicial) : "");
  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [documentos, setDocumentos] = useState<string[]>([""]);
  const [instrucciones, setInstrucciones] = useState("");
  const [fecha, setFecha] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open || procesos) return;
    const { data } = await api.GET("/api/v2/procesos", { params: { query: { limite: 100 } } });
    setProcesos(data?.items ?? []);
  }, [open, procesos]);
  useLoadEffect(cargar);

  const proceso = procesos?.find((p) => String(p.id) === procesoId);
  // Con un solo cliente no hace falta elegir.
  const clienteElegido = clienteId || (proceso?.clientes.length === 1 ? String(proceso.clientes[0].id) : "");
  const hoy = hoyISO();

  function cerrar() {
    setProcesoId(procesoInicial ? String(procesoInicial) : "");
    setClienteId("");
    setTitulo("");
    setDocumentos([""]);
    setInstrucciones("");
    setFecha("");
    setErrores({});
    onClose();
  }

  function cambiarDocumento(indice: number, valor: string) {
    setDocumentos((actuales) => actuales.map((d, i) => (i === indice ? valor : d)));
  }

  function agregar() {
    if (documentos.length >= MAXIMO) return;
    setDocumentos((actuales) => [...actuales, ""]);
    // El campo nuevo aparece en el siguiente render.
    requestAnimationFrame(() => lista.current?.querySelector<HTMLInputElement>("li:last-child input")?.focus());
  }

  function alPresionar(evento: KeyboardEvent<HTMLInputElement>, indice: number) {
    if (evento.key === "Enter") {
      evento.preventDefault();
      if (indice === documentos.length - 1 && documentos[indice].trim()) agregar();
      else lista.current?.querySelectorAll<HTMLInputElement>("input")[indice + 1]?.focus();
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const pedidos = documentos.map((d) => d.trim()).filter(Boolean);
    const faltan: Record<string, string> = {};
    if (!procesoId) faltan.proceso_id = "Elige el proceso.";
    else if (!clienteElegido) faltan.cliente_id = proceso?.clientes.length ? "Elige a quién se lo pides." : "El proceso no tiene clientes vinculados.";
    if (!pedidos.length) faltan.documentos = "Escribe al menos un documento.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setEnviando(true);
    setErrores({});
    const { data, error } = await api.POST("/api/v2/documentos/solicitudes", {
      body: {
        proceso_id: Number(procesoId),
        cliente_id: Number(clienteElegido),
        // Si no le pone nombre, la solicitud se llama como el único documento pedido.
        titulo: titulo.trim() || (pedidos.length === 1 ? pedidos[0] : "Documentos para el proceso"),
        documentos: pedidos,
        instrucciones: instrucciones.trim() || null,
        fecha_limite: fecha || null,
      },
    });
    setEnviando(false);
    if (error || !data) {
      setErrores({ ...(error?.campos ?? {}), general: error?.campos ? "" : mensajeDeError(error) });
      return;
    }
    toast({
      title: "Solicitud enviada",
      description: `${data.cliente.nombre} recibió el aviso${data.fecha_limite ? ` y tiene hasta el ${diaCorto(data.fecha_limite)}` : ""}.`,
      tone: "success",
    });
    onCreada(data);
    cerrar();
  }

  return (
    <Modal open={open} onClose={cerrar} title="Pedir documentos" description="El cliente recibe un aviso y los sube desde su portal.">
      <form onSubmit={enviar} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-proceso`} className={ETIQUETA}>Proceso</label>
            <select
              id={`${id}-proceso`}
              value={procesoId}
              onChange={(e) => { setProcesoId(e.target.value); setClienteId(""); }}
              disabled={!procesos}
              aria-invalid={errores.proceso_id ? true : undefined}
              className={CAMPO}
            >
              <option value="">{procesos ? "Elige un proceso" : "Cargando procesos…"}</option>
              {procesos?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {errores.proceso_id && <p className="mt-1.5 text-[13px] text-bad">{errores.proceso_id}</p>}
          </div>
          <div>
            <label htmlFor={`${id}-cliente`} className={ETIQUETA}>Se lo pides a</label>
            <select
              id={`${id}-cliente`}
              value={clienteElegido}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={!proceso || proceso.clientes.length === 0}
              aria-invalid={errores.cliente_id ? true : undefined}
              className={CAMPO}
            >
              <option value="">{!proceso ? "Elige primero el proceso" : proceso.clientes.length === 0 ? "Sin clientes vinculados" : "Elige un cliente"}</option>
              {proceso?.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {errores.cliente_id && <p className="mt-1.5 text-[13px] text-bad">{errores.cliente_id}</p>}
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className={ETIQUETA}>Qué documentos necesitas</legend>
          <ol ref={lista} className="space-y-2">
            {documentos.map((documento, indice) => (
              <li key={indice} className="flex items-center gap-2">
                <span aria-hidden="true" className="w-5 shrink-0 text-right text-[13px] tabular-nums text-ink-3">{indice + 1}.</span>
                <input
                  value={documento}
                  maxLength={180}
                  onChange={(e) => cambiarDocumento(indice, e.target.value)}
                  onKeyDown={(e) => alPresionar(e, indice)}
                  placeholder={indice === 0 ? "Ej.: Copia de la cédula por ambas caras" : "Otro documento"}
                  aria-label={`Documento ${indice + 1}`}
                  aria-invalid={errores.documentos ? true : undefined}
                  className={CAMPO}
                />
                {documentos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDocumentos((actuales) => actuales.filter((_, i) => i !== indice))}
                    aria-label={`Quitar el documento ${indice + 1}`}
                    className="grid size-10 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-manila hover:text-ink"
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {errores.documentos && <p className="mt-1.5 text-[13px] text-bad">{errores.documentos}</p>}
          {documentos.length < MAXIMO && (
            <Button type="button" size="sm" variant="ghost" className="ml-5 mt-2" icon={<Plus size={14} />} onClick={agregar}>Agregar otro</Button>
          )}
        </fieldset>

        <label htmlFor={`${id}-titulo`} className={cx(ETIQUETA, "mt-4")}>Nombre de la solicitud <span className="font-normal text-ink-3">(opcional)</span></label>
        <input id={`${id}-titulo`} value={titulo} maxLength={255} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej.: Documentos para la demanda" className={CAMPO} />

        <fieldset className="mt-4">
          <legend className={ETIQUETA}>Fecha límite <span className="font-normal text-ink-3">(opcional)</span></legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fecha}
              min={hoy}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha límite"
              aria-invalid={errores.fecha_limite ? true : undefined}
              className={cx(CAMPO, "w-auto")}
            />
            {PLAZOS.map((p) => {
              const dia = sumarDias(hoy, p.dias);
              return (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setFecha(dia)}
                  aria-pressed={fecha === dia}
                  className={cx(
                    "min-h-9 rounded-full px-3 text-[13px] font-semibold transition-colors",
                    fecha === dia ? "bg-navy text-on-navy" : "bg-manila text-ink-2 hover:text-ink",
                  )}
                >
                  {p.nombre}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {errores.fecha_limite
              ? <span className="text-bad">{errores.fecha_limite}</span>
              : fecha ? `Le recordamos dos días antes y al día siguiente si no ha entregado.` : "Sin fecha, solo le recuerdas tú."}
          </p>
        </fieldset>

        <label htmlFor={`${id}-instrucciones`} className={cx(ETIQUETA, "mt-4")}>Instrucciones <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea
          id={`${id}-instrucciones`}
          rows={2}
          maxLength={4000}
          value={instrucciones}
          onChange={(e) => setInstrucciones(e.target.value)}
          placeholder="Ej.: Escaneados y legibles, en PDF o foto."
          className={cx(CAMPO, "resize-y py-2.5")}
        />

        {errores.general && <p role="alert" className="mt-3 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={enviando} icon={<Send size={16} />}>Enviar al cliente</Button>
        </div>
      </form>
    </Modal>
  );
}
