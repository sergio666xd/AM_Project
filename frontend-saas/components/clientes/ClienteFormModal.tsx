"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Check, UserPlus } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError } from "@/lib/api-v2/cliente";
import type { FichaCliente } from "@/lib/clientes";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Formulario = {
  nombre: string;
  email: string;
  whatsapp: string;
  documento: string;
  canal: "EMAIL" | "WHATSAPP";
  genero: "" | "FEMENINO" | "MASCULINO";
  domicilio: string;
  direccion: string;
};

const VACIO: Formulario = { nombre: "", email: "", whatsapp: "", documento: "", canal: "EMAIL", genero: "", domicilio: "", direccion: "" };

function desdeFicha(ficha: FichaCliente): Formulario {
  return {
    nombre: ficha.nombre,
    email: ficha.email,
    whatsapp: ficha.whatsapp ?? "",
    documento: ficha.documento ?? "",
    canal: ficha.canal ?? "EMAIL",
    genero: ficha.genero ?? "",
    domicilio: ficha.domicilio ?? "",
    direccion: ficha.direccion ?? "",
  };
}

/**
 * Crear un cliente (sin `clienteId`) o editar sus datos. Al crearlo, la contraseña
 * temporal se genera sola y le llega por el canal elegido.
 */
export function ClienteFormModal({ open, clienteId, onClose, onGuardado }: {
  open: boolean;
  clienteId?: number | null;
  onClose: () => void;
  onGuardado: (ficha: FichaCliente) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const editando = Boolean(clienteId);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [cargado, setCargado] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!open || !clienteId || cargado === clienteId) return;
    const { data, error } = await api.GET("/api/v2/clientes/{cliente_id}", { params: { path: { cliente_id: clienteId } } });
    if (data) {
      setForm(desdeFicha(data));
      setCargado(clienteId);
    } else setErrores({ general: mensajeDeError(error) });
  }, [open, clienteId, cargado]);
  useLoadEffect(cargar);

  function cerrar() {
    if (guardando) return;
    setForm(VACIO);
    setCargado(null);
    setErrores({});
    onClose();
  }

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actuales) => ({ ...actuales, [campo]: "" }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const faltan: Record<string, string> = {};
    if (form.nombre.trim().length < 3) faltan.nombre = "Escribe el nombre completo.";
    if (!editando && !/^\S+@\S+\.\S+$/.test(form.email.trim())) faltan.email = "Escribe un correo válido.";
    if (!editando && form.canal === "WHATSAPP" && !form.whatsapp.trim()) faltan.whatsapp = "Escribe el WhatsApp para enviarle el acceso por ese canal.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    const datos = {
      nombre: form.nombre,
      whatsapp: form.whatsapp || null,
      documento: form.documento || null,
      domicilio: form.domicilio || null,
      direccion: form.direccion || null,
    };
    const respuesta = editando && clienteId
      ? await api.PATCH("/api/v2/clientes/{cliente_id}", {
        params: { path: { cliente_id: clienteId } },
        body: { ...datos, genero: form.genero || null },
      })
      : await api.POST("/api/v2/clientes", { body: { ...datos, email: form.email.trim(), canal: form.canal } });
    setGuardando(false);
    if (respuesta.error || !respuesta.data) {
      const campos = respuesta.error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(respuesta.error) });
      return;
    }
    const ficha = respuesta.data;
    toast(editando
      ? { title: "Datos guardados", tone: "success" }
      : {
        title: "Cliente creado",
        description: `Le enviamos el acceso al portal por ${form.canal === "WHATSAPP" ? "WhatsApp" : "correo"}.`,
        tone: "success",
      });
    setForm(VACIO);
    setCargado(null);
    onGuardado(ficha);
    onClose();
  }

  const listo = !editando || cargado === clienteId;

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={editando ? "Editar datos del cliente" : "Nuevo cliente"}
      description={editando ? "El correo no se cambia: es su usuario para entrar al portal." : "Le enviamos una contraseña temporal; al entrar, la cambia."}
    >
      <form onSubmit={enviar} noValidate aria-busy={!listo}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id={`${id}-nombre`} etiqueta="Nombre completo" error={errores.nombre} className="sm:col-span-2">
            <input id={`${id}-nombre`} value={form.nombre} maxLength={150} disabled={!listo} autoComplete="off" onChange={(e) => cambiar("nombre", e.target.value)} aria-invalid={errores.nombre ? true : undefined} className={CAMPO} />
          </Campo>
          <Campo id={`${id}-email`} etiqueta="Correo" error={errores.email} ayuda={editando ? undefined : "Es su usuario para entrar al portal."}>
            <input id={`${id}-email`} type="email" value={form.email} disabled={editando} autoComplete="off" onChange={(e) => cambiar("email", e.target.value)} aria-invalid={errores.email ? true : undefined} className={CAMPO} />
          </Campo>
          <Campo id={`${id}-whatsapp`} etiqueta="WhatsApp" opcional={editando || form.canal === "EMAIL"} error={errores.whatsapp}>
            <input id={`${id}-whatsapp`} type="tel" inputMode="tel" value={form.whatsapp} maxLength={20} disabled={!listo} placeholder="300 123 4567" onChange={(e) => cambiar("whatsapp", e.target.value)} aria-invalid={errores.whatsapp ? true : undefined} className={CAMPO} />
          </Campo>
          <Campo id={`${id}-documento`} etiqueta="Número de documento" opcional error={errores.documento}>
            <input id={`${id}-documento`} value={form.documento} maxLength={40} disabled={!listo} inputMode="numeric" placeholder="Sin puntos" onChange={(e) => cambiar("documento", e.target.value)} className={CAMPO} />
          </Campo>
          {editando ? (
            <>
              <Campo id={`${id}-genero`} etiqueta="Género" opcional ayuda="Para redactar el contrato (identificada o identificado).">
                <select id={`${id}-genero`} value={form.genero} disabled={!listo} onChange={(e) => cambiar("genero", e.target.value as Formulario["genero"])} className={CAMPO}>
                  <option value="">Sin especificar</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="MASCULINO">Masculino</option>
                </select>
              </Campo>
              <Campo id={`${id}-domicilio`} etiqueta="Ciudad de domicilio" opcional>
                <input id={`${id}-domicilio`} value={form.domicilio} maxLength={120} disabled={!listo} placeholder="Medellín" onChange={(e) => cambiar("domicilio", e.target.value)} className={CAMPO} />
              </Campo>
              <Campo id={`${id}-direccion`} etiqueta="Dirección" opcional className="sm:col-span-2">
                <input id={`${id}-direccion`} value={form.direccion} maxLength={300} disabled={!listo} onChange={(e) => cambiar("direccion", e.target.value)} className={CAMPO} />
              </Campo>
            </>
          ) : (
            <fieldset>
              <legend className={ETIQUETA}>Enviar el acceso por</legend>
              <div className="flex gap-2">
                {(["EMAIL", "WHATSAPP"] as const).map((canal) => (
                  <button
                    key={canal}
                    type="button"
                    aria-pressed={form.canal === canal}
                    onClick={() => cambiar("canal", canal)}
                    className={cx(
                      "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold transition-colors",
                      form.canal === canal ? "bg-navy text-on-navy" : "bg-sheet text-ink-2 shadow-[0_0_0_1px_var(--line-strong)] hover:text-ink",
                    )}
                  >
                    {form.canal === canal && <Check aria-hidden="true" size={14} />}
                    {canal === "EMAIL" ? "Correo" : "WhatsApp"}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        {errores.general && <p role="alert" className="mt-4 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} disabled={!listo} icon={editando ? <Check size={16} /> : <UserPlus size={16} />}>
            {editando ? "Guardar" : "Crear y enviar acceso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function Campo({ id, etiqueta, opcional, ayuda, error, className, children }: {
  id: string;
  etiqueta: string;
  opcional?: boolean;
  ayuda?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={ETIQUETA}>
        {etiqueta} {opcional && <span className="font-normal text-ink-3">(opcional)</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-[13px] text-bad">{error}</p> : ayuda ? <p className="mt-1.5 text-[13px] text-ink-3">{ayuda}</p> : null}
    </div>
  );
}
