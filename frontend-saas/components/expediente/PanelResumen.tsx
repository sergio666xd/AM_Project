"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, ListChecks, Mail, MessageCircle, Pencil, Phone, Save } from "lucide-react";

import { CAMPO, ETIQUETA } from "@/components/expediente/CalculadoraTermino";
import type { Proceso, Relaciones } from "@/components/expediente/Expediente";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Radicado } from "@/components/ui/Radicado";
import { SheetHeader } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/ToastProvider";
import { api, mensajeDeError, type Esquemas } from "@/lib/api-v2/cliente";
import { cx } from "@/lib/cx";
import { diaCorto, fechaConHora, fechaCorta } from "@/lib/fechas";
import { RUTA_TAREA } from "@/lib/tareas";
import { useLoadEffect } from "@/lib/useLoadEffect";
import { useNow } from "@/lib/useNow";

const BASE = "/gestion-procesos/abogado";

type Datos = {
  tareas: Esquemas["ListaTareas"];
  eventos: Esquemas["EventoDelProceso"][];
  documentos: Esquemas["ResumenDocumentos"];
  solicitudes: Esquemas["Solicitud"][];
};

type Proximo = { clave: string; tipo: "tarea" | "evento"; titulo: string; detalle: string; fecha: string; cuando: string; vencida: boolean; href: string };

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Lo esencial del proceso en una vista: qué viene, qué llegó del juzgado y qué falta del cliente. */
export function PanelResumen({ proceso, relaciones, onCambio }: { proceso: Proceso; relaciones: Relaciones; onCambio: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);

  const cargar = useCallback(async () => {
    const proceso_id = proceso.id;
    const [tareas, eventos, documentos, solicitudes] = await Promise.all([
      api.GET("/api/v2/tareas", { params: { query: { proceso_id, grupo: "abiertas" } } }),
      api.GET("/api/v2/agenda/eventos", { params: { query: { proceso_id } } }),
      api.GET("/api/v2/documentos", { params: { query: { proceso_id, grupo: "por_revisar" } } }),
      api.GET("/api/v2/documentos/solicitudes", { params: { query: { proceso_id, grupo: "abiertas" } } }),
    ]);
    if (tareas.data && eventos.data && documentos.data && solicitudes.data) {
      setDatos({ tareas: tareas.data, eventos: eventos.data.items, documentos: documentos.data.resumen, solicitudes: solicitudes.data.items });
      setFallo(null);
    } else {
      setFallo(mensajeDeError(tareas.error ?? eventos.error ?? documentos.error ?? solicitudes.error));
    }
  }, [proceso.id]);
  useLoadEffect(cargar);

  const ahora = useNow();
  const proximos: Proximo[] = datos
    ? [
        ...datos.tareas.items.filter((t) => t.fecha_limite).map((t) => ({
          clave: `tarea:${t.id}`, tipo: "tarea" as const, titulo: t.titulo,
          detalle: [t.responsable?.nombre, t.cliente ? `para ${t.cliente.nombre}` : null].filter(Boolean).join(" · "),
          fecha: t.fecha_limite!, cuando: `${t.vencida ? "Venció" : "Vence"} ${fechaCorta(t.fecha_limite)}`, vencida: t.vencida, href: RUTA_TAREA(t.id),
        })),
        ...datos.eventos.filter((e) => e.estado === "PROGRAMADO" && new Date(e.inicio).getTime() >= ahora).map((e) => ({
          clave: `evento:${e.id}`, tipo: "evento" as const, titulo: e.titulo, detalle: e.etiqueta,
          fecha: e.inicio, cuando: fechaConHora(e.inicio), vencida: false, href: `${BASE}/procesos/${proceso.id}/agenda`,
        })),
      ].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6)
    : [];
  const actuaciones = relaciones.radicados
    .flatMap((r) => r.actuaciones.map((a, posicion) => ({ ...a, posicion, radicado: r })))
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.posicion - b.posicion)
    .slice(0, 5);

  const pendientes = datos && [
    datos.tareas.resumen.abiertas > 0 && { texto: plural(datos.tareas.resumen.abiertas, "tarea abierta", "tareas abiertas"), href: `${BASE}/procesos/${proceso.id}/tareas` },
    datos.tareas.resumen.vencidas > 0 && { texto: plural(datos.tareas.resumen.vencidas, "vencida", "vencidas"), href: `${BASE}/procesos/${proceso.id}/tareas`, malo: true },
    datos.documentos.por_revisar > 0 && { texto: plural(datos.documentos.por_revisar, "entrega por revisar", "entregas por revisar"), href: `${BASE}/procesos/${proceso.id}/documentos` },
    datos.solicitudes.length > 0 && { texto: plural(datos.solicitudes.length, "solicitud esperando al cliente", "solicitudes esperando al cliente"), href: `${BASE}/procesos/${proceso.id}/documentos` },
  ].filter((x): x is { texto: string; href: string; malo?: boolean } => Boolean(x));

  return (
    <div>
      <p className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-sheet-2 px-4 py-2.5 text-[14px] text-ink-2 sm:px-5">
        {fallo ? <span className="text-bad">{fallo}</span>
          : !pendientes ? <span className="h-4 w-64 animate-pulse rounded bg-manila" />
          : pendientes.length === 0 ? "Nada pendiente en este proceso."
          : pendientes.map((p, i) => (
            <span key={p.texto} className="inline-flex items-center gap-2">
              {i > 0 && <span aria-hidden="true" className="text-ink-3">·</span>}
              <Link href={p.href} className={cx("font-semibold underline-offset-2 hover:underline", p.malo ? "text-bad" : "text-ink")}>{p.texto}</Link>
            </span>
          ))}
      </p>

      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:divide-x lg:divide-line">
        <div className="min-w-0">
          <SheetHeader title="Lo que viene" action={<Link href={`${BASE}/procesos/${proceso.id}/tareas`} className="text-[13px] font-semibold text-navy-ink hover:underline">Ver tareas</Link>} />
          {!datos ? <Cargando /> : proximos.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-3 sm:px-5">No hay tareas con fecha ni eventos programados.</p>
          ) : (
            <ul className="divide-y divide-line">
              {proximos.map((p) => (
                <li key={p.clave}>
                  <Link href={p.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-sheet-2 sm:px-5">
                    <span className={cx("grid size-8 shrink-0 place-items-center rounded-md", p.vencida ? "bg-bad-soft text-bad" : "bg-manila text-ink-2")}>
                      {p.tipo === "evento" ? <CalendarDays aria-hidden="true" size={16} /> : <ListChecks aria-hidden="true" size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{p.titulo}</span>
                      {p.detalle && <span className="block truncate text-[13px] text-ink-3">{p.detalle}</span>}
                    </span>
                    <span className={cx("shrink-0 text-right text-[13px] tabular-nums", p.vencida ? "font-semibold text-bad" : "text-ink-2")}>{p.cuando}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <SheetHeader title="Últimas actuaciones" className="border-t" action={relaciones.radicados.length > 0 ? <Link href={`${BASE}/procesos/${proceso.id}/folios`} className="text-[13px] font-semibold text-navy-ink hover:underline">Ver folios</Link> : undefined} />
          {actuaciones.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-3 sm:px-5">
              {relaciones.radicados.length ? "El juzgado aún no registra actuaciones." : "Este proceso no tiene radicados. Agréguelos en Clientes y radicados."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {actuaciones.map((a) => (
                <li key={a.id}>
                  <Link href={`${BASE}/radicados/${a.radicado.id}`} className="block px-4 py-2.5 hover:bg-sheet-2 sm:px-5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{a.texto}</span>
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-3">{a.fecha ? diaCorto(a.fecha) : "Sin fecha"}</span>
                    </span>
                    <Radicado numero={a.radicado.numero} copiable={false} className="text-[12.5px] text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <SheetHeader title="Esperando al cliente" className="border-t" action={<Link href={`${BASE}/documentos?proceso=${proceso.id}`} className="text-[13px] font-semibold text-navy-ink hover:underline">Documentos</Link>} />
          {!datos ? <Cargando /> : datos.solicitudes.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-3 sm:px-5">El cliente no tiene documentos pendientes.</p>
          ) : (
            <ul className="divide-y divide-line">
              {datos.solicitudes.map((s) => (
                <li key={s.id}>
                  <Link href={`${BASE}/documentos?proceso=${proceso.id}#solicitud-${s.id}`} className="block px-4 py-2.5 hover:bg-sheet-2 sm:px-5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[14px] font-semibold text-ink">{s.titulo}</span>
                      <span className="shrink-0 text-[13px] tabular-nums text-ink-2">{s.entregados} de {s.pedidos.length}</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-manila">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${(s.entregados / Math.max(1, s.pedidos.length)) * 100}%` }} />
                    </span>
                    <span className="mt-1 block text-[13px] text-ink-3">
                      {s.cliente.nombre}{s.fecha_limite ? ` · ${s.vencida ? "venció" : "vence"} ${diaCorto(s.fecha_limite)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 border-t border-line lg:border-t-0">
          <SheetHeader
            title="Datos del proceso"
            action={proceso.puede_administrar && !proceso.archivado_en ? (
              <button type="button" onClick={() => setEditar(true)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy-ink hover:underline">
                <Pencil aria-hidden="true" size={14} />Editar
              </button>
            ) : undefined}
          />
          <dl className="space-y-3.5 px-4 py-4 text-[14px] sm:px-5">
            <div>
              <dt className="text-[13px] font-semibold text-ink-3">Descripción</dt>
              <dd className={cx("mt-0.5 whitespace-pre-wrap text-pretty", proceso.descripcion ? "text-ink" : "text-ink-3")}>{proceso.descripcion || "Sin descripción."}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-ink-3">Responsable</dt>
              <dd className="mt-0.5 text-ink">{proceso.responsable.nombre}</dd>
            </div>
            {proceso.colaboradores.length > 0 && (
              <div>
                <dt className="text-[13px] font-semibold text-ink-3">Equipo</dt>
                <dd className="mt-0.5 text-ink">{proceso.colaboradores.map((c) => c.nombre).join(", ")}</dd>
              </div>
            )}
            <div>
              <dt className="text-[13px] font-semibold text-ink-3">Creado</dt>
              <dd className="mt-0.5 text-ink">{fechaCorta(proceso.creado_en)}</dd>
            </div>
          </dl>

          <SheetHeader title="Clientes" count={relaciones.clientes.length} className="border-t" action={<Link href={`${BASE}/procesos/${proceso.id}/relaciones`} className="text-[13px] font-semibold text-navy-ink hover:underline">Gestionar</Link>} />
          {relaciones.clientes.length === 0 ? (
            <p className="px-4 py-5 text-[14px] text-ink-3 sm:px-5">Ningún cliente tiene acceso a este proceso todavía.</p>
          ) : (
            <ul className="divide-y divide-line">
              {relaciones.clientes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Link href={`${BASE}/clientes/${c.id}`} className="block truncate text-[14px] font-semibold text-ink hover:underline">{c.nombre}</Link>
                    <p className="truncate text-[13px] text-ink-3">{c.email}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Contacto href={`${BASE}/chat/${proceso.id}/${c.id}`} etiqueta={`Chat con ${c.nombre}`} icono={<MessageCircle size={16} />} />
                    <Contacto href={`mailto:${c.email}`} etiqueta={`Escribir a ${c.nombre}`} icono={<Mail size={16} />} />
                    {c.whatsapp && <Contacto href={`tel:${c.whatsapp}`} etiqueta={`Llamar a ${c.nombre}`} icono={<Phone size={16} />} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editar && <EditarProcesoModal proceso={proceso} onClose={() => setEditar(false)} onGuardado={onCambio} />}
    </div>
  );
}

function Contacto({ href, etiqueta, icono }: { href: string; etiqueta: string; icono: React.ReactNode }) {
  const clases = "grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-manila hover:text-ink";
  return href.startsWith("/") ? (
    <Link href={href} aria-label={etiqueta} title={etiqueta} className={clases}>{icono}</Link>
  ) : (
    <a href={href} aria-label={etiqueta} title={etiqueta} className={clases}>{icono}</a>
  );
}

function Cargando() {
  return (
    <div className="space-y-2 px-4 py-4 sm:px-5" aria-busy="true">
      <div className="h-10 animate-pulse rounded-lg bg-manila" />
      <div className="h-10 animate-pulse rounded-lg bg-manila" />
    </div>
  );
}

function EditarProcesoModal({ proceso, onClose, onGuardado }: { proceso: Proceso; onClose: () => void; onGuardado: () => void }) {
  const id = useId();
  const { toast } = useToast();
  const [nombre, setNombre] = useState(proceso.nombre);
  const [descripcion, setDescripcion] = useState(proceso.descripcion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (!nombre.trim()) {
      setError("Escriba el nombre del proceso.");
      return;
    }
    const body: Esquemas["CambiosProceso"] = {};
    if (nombre.trim() !== proceso.nombre) body.nombre = nombre.trim();
    if ((descripcion.trim() || null) !== (proceso.descripcion ?? null)) body.descripcion = descripcion.trim() || null;
    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }
    setGuardando(true);
    const { error: fallo } = await api.PATCH("/api/v2/procesos/{proceso_id}", { params: { path: { proceso_id: proceso.id } }, body });
    setGuardando(false);
    if (fallo) {
      setError(mensajeDeError(fallo));
      return;
    }
    toast({ title: "Datos del proceso guardados", description: body.nombre ? "Le avisamos a los clientes del nuevo nombre." : undefined, tone: "success" });
    onGuardado();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Datos del proceso">
      <form onSubmit={guardar} noValidate>
        <label htmlFor={`${id}-nombre`} className={ETIQUETA}>Nombre</label>
        <input id={`${id}-nombre`} value={nombre} maxLength={255} onChange={(e) => setNombre(e.target.value)} className={CAMPO} />
        {proceso.clientes.length > 0 && <p className="mt-1.5 text-[13px] text-ink-3">Los clientes lo ven en su portal; si lo cambia, les avisamos.</p>}
        <label htmlFor={`${id}-descripcion`} className={cx(ETIQUETA, "mt-4")}>Descripción <span className="font-normal text-ink-3">(opcional)</span></label>
        <textarea id={`${id}-descripcion`} rows={5} maxLength={4000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={cx(CAMPO, "resize-y py-2.5")} />
        {error && <p role="alert" className="mt-3 text-[13px] text-bad">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando} icon={<Save size={16} />}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
