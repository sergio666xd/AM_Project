"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BellPlus,
  Check,
  CircleDashed,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import { EditarTareaModal, VinculosTareaModal, type TareaDetalle } from "@/components/tareas/ModalesTarea";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Interruptor } from "@/components/ui/Interruptor";
import { Radicado } from "@/components/ui/Radicado";
import { RowActionsMenu, type RowAction } from "@/components/ui/RowActionsMenu";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sheet, SheetHeader } from "@/components/ui/Sheet";
import { Tag } from "@/components/ui/Tag";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaConHora, fechaLarga } from "@/lib/fechas";
import { estaAbierta, nombreEstado, prioridad } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";

type Subtarea = TareaDetalle["subtareas"][number];
type Recordatorio = TareaDetalle["recordatorios"][number];
type Respuesta = { data?: TareaDetalle; error?: unknown };

const RUTA_PROCESO = (id: number) => `/gestion-procesos/abogado/procesos/${id}`;
const ANTICIPACIONES = [
  { minutos: 60, nombre: "1 hora antes" },
  { minutos: 180, nombre: "3 horas antes" },
  { minutos: 1440, nombre: "1 día antes" },
  { minutos: 2880, nombre: "2 días antes" },
  { minutos: 10080, nombre: "1 semana antes" },
];

function anticipacion(minutos: number): string {
  return ANTICIPACIONES.find((a) => a.minutos === minutos)?.nombre
    ?? (minutos % 1440 === 0 ? `${minutos / 1440} días antes` : minutos % 60 === 0 ? `${minutos / 60} horas antes` : `${minutos} minutos antes`);
}

/** Detalle de una tarea del equipo: qué es, de qué proceso, sus subtareas y sus recordatorios. */
export function DetalleTarea({ tareaId }: { tareaId: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [tarea, setTarea] = useState<TareaDetalle | null>(null);
  const [error, setError] = useState<{ mensaje: string; noExiste: boolean } | null>(null);
  const [editar, setEditar] = useState(false);
  const [vinculos, setVinculos] = useState(false);
  const [eliminar, setEliminar] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error: fallo, response } = await api.GET("/api/v2/tareas/{tarea_id}", { params: { path: { tarea_id: tareaId } } });
    if (data) {
      setTarea(data);
      setError(null);
    } else {
      setError({ mensaje: mensajeDeError(fallo), noExiste: response.status === 404 });
    }
  }, [tareaId]);
  useLoadEffect(cargar);

  /** Aplica una respuesta que trae la tarea actualizada; devuelve el mensaje de error, si lo hubo. */
  async function aplicar(peticion: Promise<Respuesta>, exito?: string): Promise<string | null> {
    const { data, error: fallo } = await peticion;
    if (!data) {
      const mensaje = mensajeDeError(fallo);
      toast({ title: mensaje, tone: "error" });
      return mensaje;
    }
    setTarea(data);
    if (exito) toast({ title: exito, tone: "success" });
    return null;
  }

  const ruta = { params: { path: { tarea_id: tareaId } } };
  const cambiar = (body: Esquemas["CambiosTarea"], exito?: string) => aplicar(api.PATCH("/api/v2/tareas/{tarea_id}", { ...ruta, body }), exito);

  if (error) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center">
        <p className="font-display text-[22px] text-ink">{error.noExiste ? "No encontramos la tarea" : "No se pudo abrir la tarea"}</p>
        <p className="mt-2 text-[14px] text-ink-2">{error.noExiste ? "Puede que la hayan eliminado o que no sea de un proceso suyo." : error.mensaje}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/gestion-procesos/abogado/tareas" className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-[14px] font-semibold text-navy-ink hover:bg-manila">Ver las tareas</Link>
          {!error.noExiste && <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => void cargar()}>Reintentar</Button>}
        </div>
      </div>
    );
  }
  if (!tarea) return <EsqueletoTarea />;

  const abierta = estaAbierta(tarea);
  const prio = prioridad(tarea.prioridad);
  const hechas = tarea.subtareas.filter((s) => s.completada).length;
  const acciones: RowAction<TareaDetalle>[] = [
    { label: "Marcar en curso", icon: <CircleDashed size={16} />, hidden: (t) => t.estado !== "PENDIENTE", onSelect: () => void cambiar({ estado: "EN_CURSO" }, "La tarea quedó en curso") },
    { label: "Cancelar la tarea", icon: <X size={16} />, hidden: (t) => !estaAbierta(t), onSelect: () => void cambiar({ estado: "CANCELADA" }, "Tarea cancelada") },
    { label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", separated: true, onSelect: () => setEliminar(true) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/gestion-procesos/abogado/tareas" className="inline-flex min-h-10 items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
        <ArrowLeft aria-hidden="true" size={16} />
        Tareas
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone={tarea.estado === "COMPLETADA" ? "ok" : tarea.estado === "CANCELADA" ? "neutral" : tarea.vencida ? "bad" : "navy"}>
              {tarea.vencida ? "Vencida" : nombreEstado(tarea.estado)}
            </Tag>
            <Tag tone={prio.tono}>Prioridad {prio.nombre.toLowerCase()}</Tag>
          </div>
          <h1 className={cx("mt-2 font-display text-[28px] leading-tight text-balance text-ink sm:text-[32px]", tarea.estado === "CANCELADA" && "text-ink-2")}>{tarea.titulo}</h1>
          <p className={cx("mt-1.5 text-[15px]", tarea.vencida ? "font-semibold text-bad" : "text-ink-2")}>
            {tarea.estado === "COMPLETADA" && tarea.completada_en
              ? `Completada el ${fechaLarga(tarea.completada_en)}.`
              : tarea.fecha_limite
                ? `${tarea.vencida ? "Venció" : "Vence"} el ${fechaLarga(tarea.fecha_limite)}.`
                : "Sin fecha límite."}
            {tarea.proceso ? <> De <Link href={RUTA_PROCESO(tarea.proceso.id)} className="font-semibold text-navy-ink underline-offset-2 hover:underline">{tarea.proceso.nombre}</Link>.</> : " Tarea general."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditar(true)}>Editar</Button>
          {abierta
            ? <Button icon={<Check size={16} />} onClick={() => void cambiar({ estado: "COMPLETADA" }, "Tarea completada")}>Completar</Button>
            : <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={() => void cambiar({ estado: "PENDIENTE" }, "La tarea se reabrió")}>Reabrir</Button>}
          <RowActionsMenu row={tarea} actions={acciones} label="Más acciones de la tarea" />
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="grid min-w-0 gap-5">
          {tarea.descripcion && (
            <Sheet aria-label="Notas">
              <SheetHeader title="Notas" />
              <p className="whitespace-pre-line px-4 py-3.5 text-[15px] leading-relaxed text-pretty text-ink-2">{tarea.descripcion}</p>
            </Sheet>
          )}
          <Subtareas tarea={tarea} hechas={hechas} aplicar={aplicar} onLocal={setTarea} />
          <Recordatorios tarea={tarea} aplicar={aplicar} />
        </div>

        <Sheet aria-label="Datos de la tarea" className="lg:sticky lg:top-4">
          <SheetHeader
            title="Datos"
            action={<Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={() => setVinculos(true)}>Cambiar</Button>}
          />
          <dl className="grid gap-3.5 px-4 py-4 text-[14px]">
            <Dato nombre="Proceso">
              {tarea.proceso
                ? <Link href={RUTA_PROCESO(tarea.proceso.id)} className="font-semibold text-navy-ink underline-offset-2 hover:underline">{tarea.proceso.nombre}</Link>
                : <span className="text-ink-3">Tarea general</span>}
            </Dato>
            {tarea.radicado && <Dato nombre="Radicado"><Radicado numero={tarea.radicado.numero} /></Dato>}
            {tarea.actuacion && (
              <Dato nombre="Actuación">
                <span className="text-ink">{tarea.actuacion.texto}</span>
                {tarea.actuacion.fecha && <span className="block text-[13px] text-ink-3">{diaCorto(tarea.actuacion.fecha)}</span>}
              </Dato>
            )}
            <Dato nombre="Para">
              {tarea.cliente
                ? <span className="text-ink">{tarea.cliente.nombre} <span className="text-ink-3">(cliente; la ve en su portal)</span></span>
                : <span className="text-ink">El equipo</span>}
            </Dato>
            <Dato nombre="Responsable"><span className="text-ink">{tarea.responsable.nombre}</span></Dato>
            <Dato nombre="Creada"><span className="text-ink-2">{fechaConHora(tarea.creada_en)}</span></Dato>
            {tarea.actualizada_en !== tarea.creada_en && <Dato nombre="Último cambio"><span className="text-ink-2">{fechaConHora(tarea.actualizada_en)}</span></Dato>}
          </dl>
        </Sheet>
      </div>

      {editar && <EditarTareaModal tarea={tarea} open onClose={() => setEditar(false)} onGuardar={(c) => cambiar(c, "Cambios guardados")} />}
      {vinculos && <VinculosTareaModal tarea={tarea} open onClose={() => setVinculos(false)} onGuardar={(c) => cambiar(c, "Cambios guardados")} />}
      <ConfirmDialog
        open={eliminar}
        onClose={() => setEliminar(false)}
        destructive
        title="¿Eliminar la tarea?"
        description={`«${tarea.titulo}», sus subtareas y sus recordatorios se borran. No se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const { error: fallo } = await api.DELETE("/api/v2/tareas/{tarea_id}", ruta);
          if (fallo) throw new Error(mensajeDeError(fallo));
          toast({ title: "Tarea eliminada", tone: "success" });
          router.push("/gestion-procesos/abogado/tareas");
        }}
      />
    </div>
  );
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-semibold text-ink-3">{nombre}</dt>
      <dd className="mt-0.5 min-w-0 break-words">{children}</dd>
    </div>
  );
}

type Aplicar = (peticion: Promise<Respuesta>, exito?: string) => Promise<string | null>;

function Subtareas({ tarea, hechas, aplicar, onLocal }: {
  tarea: TareaDetalle;
  hechas: number;
  aplicar: Aplicar;
  onLocal: (tarea: TareaDetalle) => void;
}) {
  const id = useId();
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clientes, setClientes] = useState<Esquemas["PersonaBreve"][] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const base = { params: { path: { tarea_id: tarea.id } } };

  const cargarClientes = useCallback(async () => {
    if (!tarea.proceso) return setClientes([]);
    const { data } = await api.GET("/api/v2/procesos/{proceso_id}/vinculos", { params: { path: { proceso_id: tarea.proceso.id } } });
    setClientes(data?.clientes ?? []);
  }, [tarea.proceso]);
  useLoadEffect(cargarClientes);

  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    if (!titulo.trim()) return;
    setGuardando(true);
    const fallo = await aplicar(api.POST("/api/v2/tareas/{tarea_id}/subtareas", {
      ...base, body: { titulo: titulo.trim(), cliente_id: clienteId ? Number(clienteId) : null, avisar_correo: true, avisar_whatsapp: true },
    }), clienteId ? "Subtarea agregada; se le avisó al cliente" : undefined);
    setGuardando(false);
    if (!fallo) {
      setTitulo("");
      setClienteId("");
    }
  }

  const ruta = (s: Subtarea) => ({ params: { path: { tarea_id: tarea.id, subtarea_id: s.id } } });
  const cambiar = (s: Subtarea, body: Esquemas["CambiosSubtarea"], exito?: string) =>
    aplicar(api.PATCH("/api/v2/tareas/{tarea_id}/subtareas/{subtarea_id}", { ...ruta(s), body }), exito);
  const acciones = (s: Subtarea): RowAction<Subtarea>[] => [
    ...(clientes ?? []).filter((c) => c.id !== s.cliente?.id).map((c) => ({
      label: `Pedírsela a ${c.nombre}`, icon: <UserRound size={16} />, onSelect: () => void cambiar(s, { cliente_id: c.id }, `Se le avisó a ${c.nombre}`),
    })),
    { label: "Dejarla para el equipo", icon: <X size={16} />, hidden: () => !s.cliente, onSelect: () => void cambiar(s, { cliente_id: null }) },
    { label: "Quitar", icon: <Trash2 size={16} />, tone: "danger", separated: true, onSelect: () => void aplicar(api.DELETE("/api/v2/tareas/{tarea_id}/subtareas/{subtarea_id}", ruta(s))) },
  ];

  return (
    <Sheet aria-label="Subtareas">
      <SheetHeader title="Subtareas" action={tarea.subtareas.length > 0 && <span className="text-[13px] tabular-nums text-ink-3">{hechas} de {tarea.subtareas.length} hechas</span>} />
      {tarea.subtareas.length > 0 && (
        <ul className="divide-y divide-line">
          {tarea.subtareas.map((s) => (
            <li key={s.id} className="flex items-center gap-1 py-1 pl-2 pr-2">
              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-2">
                <input
                  type="checkbox"
                  checked={s.completada}
                  onChange={(e) => {
                    // Se marca enseguida; si la API lo rechaza, el aviso de error y la respuesta lo corrigen.
                    const completada = e.target.checked;
                    onLocal({ ...tarea, subtareas: tarea.subtareas.map((x) => (x.id === s.id ? { ...x, completada } : x)) });
                    void cambiar(s, { completada }).then((fallo) => { if (fallo) onLocal(tarea); });
                  }}
                  className="size-[18px] shrink-0 accent-[var(--navy)]"
                />
                <span className="min-w-0">
                  <span className={cx("block text-[15px] text-pretty", s.completada ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink")}>{s.titulo}</span>
                  {s.cliente && <span className="block text-[12.5px] text-ink-3">Se la pidió a {s.cliente.nombre} (cliente)</span>}
                </span>
              </label>
              <RowActionsMenu row={s} actions={acciones(s)} label={`Acciones de «${s.titulo}»`} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={agregar} className={cx("grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end", tarea.subtareas.length > 0 && "border-t border-line")}>
        <div className="min-w-0">
          <label htmlFor={`${id}-titulo`} className="sr-only">Nueva subtarea</label>
          <input id={`${id}-titulo`} value={titulo} maxLength={255} onChange={(e) => setTitulo(e.target.value)} placeholder={tarea.subtareas.length ? "Agregar otra subtarea" : "Dividir la tarea en pasos: escriba el primero"} className={CAMPO} />
        </div>
        {clientes && clientes.length > 0 && (
          <div>
            <label htmlFor={`${id}-cliente`} className="sr-only">Para quién</label>
            <select id={`${id}-cliente`} value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={cx(CAMPO, "sm:w-52")}>
              <option value="">Para el equipo</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>Pedírsela a {c.nombre}</option>)}
            </select>
          </div>
        )}
        <Button type="submit" variant="secondary" loading={guardando} disabled={!titulo.trim()} icon={<Plus size={16} />}>Agregar</Button>
      </form>
    </Sheet>
  );
}

function Recordatorios({ tarea, aplicar }: { tarea: TareaDetalle; aplicar: Aplicar }) {
  const id = useId();
  const abierta = estaAbierta(tarea);
  const [nuevo, setNuevo] = useState(false);
  const [modo, setModo] = useState<"antes" | "momento">(tarea.fecha_limite ? "antes" : "momento");
  const [minutos, setMinutos] = useState(1440);
  const [momento, setMomento] = useState("");
  const [correo, setCorreo] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const base = { params: { path: { tarea_id: tarea.id } } };
  const destinatario = tarea.cliente?.nombre ?? tarea.responsable.nombre;

  async function programar(evento: FormEvent) {
    evento.preventDefault();
    if (modo === "momento" && !momento) {
      setError("Elija el día y la hora.");
      return;
    }
    if (!correo && !whatsapp) {
      setError("Elija al menos un canal.");
      return;
    }
    setGuardando(true);
    const fallo = await aplicar(api.POST("/api/v2/tareas/{tarea_id}/recordatorios", {
      ...base,
      body: {
        correo, whatsapp,
        ...(modo === "antes" ? { anticipacion_minutos: minutos } : { fecha_hora: `${momento}:00-05:00` }),
      },
    }), "Recordatorio programado");
    setGuardando(false);
    if (fallo) setError(fallo);
    else {
      setNuevo(false);
      setError(null);
      setMomento("");
    }
  }

  const ruta = (r: Recordatorio) => ({ params: { path: { tarea_id: tarea.id, recordatorio_id: r.id } } });
  return (
    <Sheet aria-label="Recordatorios">
      <SheetHeader
        title="Recordatorios"
        action={abierta && !nuevo && <Button size="sm" variant="ghost" icon={<BellPlus size={14} />} onClick={() => setNuevo(true)}>Programar</Button>}
      />
      <div className="px-4 py-3.5 text-[14px] text-ink-2">
        {!abierta
          ? "La tarea está cerrada: no se manda ningún recordatorio."
          : tarea.avisos_automaticos.length > 0
            ? `La plataforma le recuerda a ${destinatario} el ${tarea.avisos_automaticos.map((m) => fechaConHora(m)).join(" y el ")}.`
            : tarea.fecha_limite
              ? "La fecha límite está muy cerca para los recordatorios automáticos de 24 y 12 horas antes."
              : "Con una fecha límite, la plataforma recuerda sola 24 y 12 horas antes."}
      </div>

      {tarea.recordatorios.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {tarea.recordatorios.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-1.5 pl-4 pr-2">
              <div className="min-w-0 flex-1">
                <p className={cx("text-[15px]", r.activo && !r.enviado_en ? "text-ink" : "text-ink-3")}>
                  {r.anticipacion_minutos != null ? anticipacion(r.anticipacion_minutos) : fechaConHora(r.fecha_hora)}
                  {r.anticipacion_minutos != null && r.cuando && <span className="text-ink-3"> · {fechaConHora(r.cuando)}</span>}
                </p>
                <p className="text-[12.5px] text-ink-3">
                  {[r.correo && "Correo", r.whatsapp && "WhatsApp"].filter(Boolean).join(" y ")} a {tarea.responsable.nombre}
                  {r.enviado_en ? ` · Se envió ${fechaConHora(r.enviado_en)}` : !r.cuando ? " · Necesita fecha límite" : ""}
                </p>
              </div>
              {!r.enviado_en && abierta && (
                <Interruptor
                  activo={r.activo}
                  etiqueta={r.activo ? "Pausar el recordatorio" : "Activar el recordatorio"}
                  onCambio={(activo) => void aplicar(api.PATCH("/api/v2/tareas/{tarea_id}/recordatorios/{recordatorio_id}", { ...ruta(r), body: { activo } }))}
                />
              )}
              <button
                type="button"
                aria-label="Quitar el recordatorio"
                onClick={() => void aplicar(api.DELETE("/api/v2/tareas/{tarea_id}/recordatorios/{recordatorio_id}", ruta(r)))}
                className="grid size-11 place-items-center rounded-md text-ink-3 hover:bg-manila hover:text-bad sm:size-10"
              >
                <Trash2 aria-hidden="true" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {nuevo && (
        <form onSubmit={programar} noValidate className="grid gap-4 border-t border-line px-4 py-4">
          <SegmentedControl<"antes" | "momento">
            label="Cuándo"
            value={modo}
            onChange={setModo}
            options={[{ value: "antes", label: "Antes del vencimiento" }, { value: "momento", label: "Un día y hora" }]}
          />
          {modo === "antes" ? (
            tarea.fecha_limite ? (
              <div>
                <label htmlFor={`${id}-antes`} className={ETIQUETA}>Cuánto antes</label>
                <select id={`${id}-antes`} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} className={cx(CAMPO, "sm:max-w-xs")}>
                  {ANTICIPACIONES.map((a) => <option key={a.minutos} value={a.minutos}>{a.nombre}</option>)}
                </select>
              </div>
            ) : <p className="text-[14px] text-ink-2">La tarea no tiene fecha límite. Póngale una con «Editar» o elija un día y hora.</p>
          ) : (
            <div>
              <label htmlFor={`${id}-momento`} className={ETIQUETA}>Día y hora</label>
              <input id={`${id}-momento`} type="datetime-local" value={momento} onChange={(e) => setMomento(e.target.value)} className={cx(CAMPO, "sm:max-w-xs")} />
            </div>
          )}
          <fieldset>
            <legend className={ETIQUETA}>Por dónde le llega a {tarea.responsable.nombre}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <label className="inline-flex min-h-10 items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={correo} onChange={(e) => setCorreo(e.target.checked)} className="size-4 accent-[var(--navy)]" />Correo</label>
              <label className="inline-flex min-h-10 items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={whatsapp} onChange={(e) => setWhatsapp(e.target.checked)} className="size-4 accent-[var(--navy)]" />WhatsApp</label>
            </div>
          </fieldset>
          {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => { setNuevo(false); setError(null); }}>Cancelar</Button>
            <Button type="submit" loading={guardando} disabled={modo === "antes" && !tarea.fecha_limite} icon={<BellPlus size={16} />}>Programar</Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

function EsqueletoTarea() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true" aria-label="Cargando la tarea">
      <div className="h-5 w-20 rounded bg-manila" />
      <div className="mt-5 h-6 w-48 rounded bg-manila" />
      <div className="mt-3 h-9 w-3/4 max-w-xl rounded bg-manila" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-56 rounded-xl bg-sheet shadow-sheet" />
        <div className="h-72 rounded-xl bg-sheet shadow-sheet" />
      </div>
    </div>
  );
}
