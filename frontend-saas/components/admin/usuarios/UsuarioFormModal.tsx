"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Check, UserPlus } from "lucide-react";

import { Campo } from "@/components/clientes/ClienteFormModal";
import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { useLoadEffect } from "@/lib/useLoadEffect";
import type { FichaUsuario } from "@/lib/usuariosAdmin";

type RolCreable = Esquemas["NuevoUsuario"]["rol"];
type Formulario = { nombre: string; email: string; whatsapp: string; rol: RolCreable; responsable: string };

const VACIO: Formulario = { nombre: "", email: "", whatsapp: "", rol: "CLIENTE", responsable: "" };
const ROLES: { valor: RolCreable; nombre: string; ayuda: string }[] = [
  { valor: "CLIENTE", nombre: "Cliente", ayuda: "Ve sus procesos en el portal de clientes." },
  { valor: "ABOGADO_ADMIN", nombre: "Abogado de la firma", ayuda: "Lleva procesos en el panel del abogado." },
];

function desdeFicha(ficha: FichaUsuario): Formulario {
  return {
    nombre: ficha.nombre,
    email: ficha.email,
    whatsapp: ficha.whatsapp ?? "",
    rol: ficha.rol === "ABOGADO_ADMIN" ? "ABOGADO_ADMIN" : "CLIENTE",
    responsable: ficha.responsable ? String(ficha.responsable.id) : "",
  };
}

/**
 * Crear una cuenta (sin `ficha`) o editar sus datos. Al crearla, la contraseña
 * temporal se genera sola y llega por correo; la administración no la escribe.
 */
export function UsuarioFormModal({ open, ficha, rolInicial, onClose, onGuardado }: {
  open: boolean;
  ficha?: FichaUsuario | null;
  rolInicial?: RolCreable;
  onClose: () => void;
  onGuardado: (ficha: FichaUsuario) => void;
}) {
  const id = useId();
  const { toast } = useToast();
  const editando = Boolean(ficha);
  const [form, setForm] = useState<Formulario | null>(null);
  const [equipo, setEquipo] = useState<{ id: number; nombre: string }[] | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  const actual: Formulario = form ?? (ficha ? desdeFicha(ficha) : { ...VACIO, rol: rolInicial ?? "CLIENTE" });
  const puedeElegirRol = !editando || Boolean(ficha?.puede_cambiar_rol && ficha.rol !== "ABOGADO");
  const esCliente = actual.rol === "CLIENTE" && (ficha?.rol ?? "CLIENTE") !== "ABOGADO";

  const cargarEquipo = useCallback(async () => {
    if (!open || equipo) return;
    const { data } = await api.GET("/api/v2/admin/usuarios", { params: { query: { grupo: "equipo", estado: "activo", limite: 100 } } });
    setEquipo((data?.items ?? []).map((u) => ({ id: u.id, nombre: u.nombre })));
  }, [open, equipo]);
  useLoadEffect(cargarEquipo);

  function cerrar() {
    if (guardando) return;
    setForm(null);
    setErrores({});
    onClose();
  }

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm({ ...actual, [campo]: valor });
    setErrores((previos) => ({ ...previos, [campo]: "", responsable_id: campo === "responsable" ? "" : previos.responsable_id ?? "" }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const faltan: Record<string, string> = {};
    if (actual.nombre.trim().length < 2) faltan.nombre = "Escriba el nombre completo.";
    if (!editando && !/^\S+@\S+\.\S+$/.test(actual.email.trim())) faltan.email = "Escriba un correo válido.";
    if (esCliente && !actual.responsable) faltan.responsable_id = "Elija quién lleva a este cliente.";
    if (Object.keys(faltan).length) {
      setErrores(faltan);
      return;
    }
    setGuardando(true);
    setErrores({});
    const responsable_id = esCliente ? Number(actual.responsable) : null;
    const respuesta = ficha
      ? await api.PATCH("/api/v2/admin/usuarios/{usuario_id}", {
        params: { path: { usuario_id: ficha.id } },
        body: {
          nombre: actual.nombre,
          whatsapp: actual.whatsapp || null,
          ...(puedeElegirRol && actual.rol !== ficha.rol ? { rol: actual.rol } : {}),
          ...(esCliente ? { responsable_id } : {}),
        },
      })
      : await api.POST("/api/v2/admin/usuarios", {
        body: { nombre: actual.nombre, email: actual.email.trim(), whatsapp: actual.whatsapp || null, rol: actual.rol, responsable_id },
      });
    setGuardando(false);
    if (respuesta.error || !respuesta.data) {
      const campos = respuesta.error?.campos ?? {};
      setErrores({ ...campos, general: Object.keys(campos).length ? "" : mensajeDeError(respuesta.error) });
      return;
    }
    toast(editando
      ? { title: "Datos guardados", tone: "success" }
      : { title: "Cuenta creada", description: `Le enviamos a ${respuesta.data.email} el usuario y una contraseña temporal.`, tone: "success" });
    setForm(null);
    onGuardado(respuesta.data);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={editando ? "Editar la cuenta" : "Nueva cuenta"}
      description={editando
        ? "El correo no se cambia: es el usuario para entrar."
        : "Le llega por correo una contraseña temporal; al entrar, crea una nueva."}
    >
      <form onSubmit={enviar} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {puedeElegirRol && (
            <fieldset className="sm:col-span-2">
              <legend className={ETIQUETA}>Tipo de cuenta</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLES.map((rol) => {
                  const elegido = actual.rol === rol.valor;
                  return (
                    <button
                      key={rol.valor}
                      type="button"
                      aria-pressed={elegido}
                      onClick={() => cambiar("rol", rol.valor)}
                      className={cx(
                        "flex min-h-14 items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-[background-color,box-shadow]",
                        elegido ? "bg-navy-soft shadow-[0_0_0_2px_var(--navy)]" : "bg-sheet shadow-[0_0_0_1px_var(--line-strong)] hover:bg-sheet-2",
                      )}
                    >
                      <span className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", elegido ? "border-navy bg-navy text-on-navy" : "border-line-strong")}>
                        {elegido && <Check aria-hidden="true" size={10} strokeWidth={3} />}
                      </span>
                      <span>
                        <span className="block text-[14px] font-semibold text-ink">{rol.nombre}</span>
                        <span className="block text-[13px] text-ink-2">{rol.ayuda}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {errores.rol && <p className="mt-1.5 text-[13px] text-bad">{errores.rol}</p>}
            </fieldset>
          )}
          <Campo id={`${id}-nombre`} etiqueta="Nombre completo" error={errores.nombre} className="sm:col-span-2">
            <input id={`${id}-nombre`} value={actual.nombre} maxLength={150} autoComplete="off" onChange={(e) => cambiar("nombre", e.target.value)} aria-invalid={errores.nombre ? true : undefined} className={CAMPO} />
          </Campo>
          <Campo id={`${id}-email`} etiqueta="Correo" error={errores.email} ayuda={editando ? undefined : "Es su usuario para entrar."}>
            <input id={`${id}-email`} type="email" value={actual.email} disabled={editando} autoComplete="off" onChange={(e) => cambiar("email", e.target.value)} aria-invalid={errores.email ? true : undefined} className={CAMPO} />
          </Campo>
          <Campo id={`${id}-whatsapp`} etiqueta="WhatsApp" opcional error={errores.whatsapp}>
            <input id={`${id}-whatsapp`} type="tel" inputMode="tel" value={actual.whatsapp} maxLength={20} placeholder="300 123 4567" onChange={(e) => cambiar("whatsapp", e.target.value)} className={CAMPO} />
          </Campo>
          {esCliente && (
            <Campo id={`${id}-responsable`} etiqueta="Abogado responsable" error={errores.responsable_id} ayuda="Quien lleva sus procesos y le responde en el portal." className="sm:col-span-2">
              <select id={`${id}-responsable`} value={actual.responsable} disabled={!equipo} onChange={(e) => cambiar("responsable", e.target.value)} aria-invalid={errores.responsable_id ? true : undefined} className={CAMPO}>
                <option value="">{equipo ? "Elija un abogado" : "Cargando el equipo…"}</option>
                {equipo?.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
              </select>
            </Campo>
          )}
        </div>

        {errores.general && <p role="alert" className="mt-4 text-[13px] text-bad">{errores.general}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={editando ? <Check size={16} /> : <UserPlus size={16} />}>
            {editando ? "Guardar" : "Crear y enviar acceso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
