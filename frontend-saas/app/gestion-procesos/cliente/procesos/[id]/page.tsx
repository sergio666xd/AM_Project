"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  ListChecks,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Upload,
  UserRound,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi, fetchBlobApi } from "@/lib/api";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { formatDate, formatDateTime, isOverdue, reviewStatusLabel, taskStatusLabel } from "@/lib/labels";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type ProcessDetail = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  estado_visible: string;
  explicacion_estado: string;
  responsable: {
    id: number;
    nombre_completo: string;
    cargo: string;
    email: string;
    whatsapp_numero?: string | null;
  };
  abogados_participantes: { nombre_completo: string }[];
  radicados: {
    id: number;
    numero: string;
    estado_visible: string;
    actuaciones: { id: number; fecha: string; descripcion: string }[];
  }[];
  tareas: {
    id: number;
    titulo: string;
    descripcion?: string | null;
    estado: string;
    cliente_id?: number | null;
    asignada_a_cliente: boolean;
    subtareas: { id: number; titulo: string; completada: boolean }[];
    fecha_limite?: string | null;
  }[];
  solicitudes_documento: {
    id: number;
    titulo: string;
    instrucciones?: string | null;
    fecha_limite?: string | null;
    atendida_en?: string | null;
    estado: string;
    documentos_requeridos: {
      id: string;
      nombre: string;
      estado: string;
      documento?: { nombre_archivo: string; comentario_revision?: string | null } | null;
    }[];
  }[];
  documentos: {
    id: number;
    solicitud_id: number;
    contrato_id?: number | null;
    nombre_archivo: string;
    estado_revision: string;
    comentario_revision?: string | null;
    created_at: string;
  }[];
  contratos: {
    id: number;
    estado: string;
    version_actual: number;
    firmado_en?: string | null;
    documento_firmado: {
      id: number;
      nombre_archivo: string;
      mime_type: string;
      created_at: string;
    } | null;
  }[];
  eventos: {
    id: number;
    titulo: string;
    descripcion?: string | null;
    fecha_inicio: string;
    tipo: string;
    estado: string;
  }[];
  comunicaciones: {
    id: number;
    asunto: string;
    contenido: string;
    remitente: string;
    es_mio: boolean;
    leido_en?: string | null;
    created_at: string;
  }[];
  timeline: {
    id: string;
    tipo: string;
    titulo: string;
    descripcion?: string;
    fecha: string;
    actor?: string | null;
  }[];
};

const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "Sin fecha";

const isUpcoming = (value: string) => Date.parse(value) >= Date.now();

type ClientTab = "novedades" | "documentos" | "tareas" | "agenda" | "mensajes" | "equipo";

function tabForHash(hash: string): ClientTab | null {
  if (hash === "actividad" || hash === "radicados" || hash.startsWith("radicado-") || hash.startsWith("actuacion-")) return "novedades";
  if (hash === "documentos") return "documentos";
  if (hash === "tareas") return "tareas";
  if (hash === "agenda" || hash.startsWith("evento-")) return "agenda";
  if (hash === "comunicacion") return "mensajes";
  return null;
}

export default function DetalleProcesoClientePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { token } = useSession();
  const [item, setItem] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ClientTab>("novedades");
  const [contractAction, setContractAction] = useState<{ id: number; type: "view" | "download" } | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi(`/api/expedientes/cliente/procesos/${id}`, { token })
      .then((data) => {
        if (active) {
          setItem(data);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar el proceso.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, token]);

  useEffect(() => {
    if (!item || !window.location.hash) return;
    const targetId = decodeURIComponent(window.location.hash.slice(1));
    const target = tabForHash(targetId);
    const timer = window.setTimeout(() => {
      if (target) setTab(target);
      requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [item]);

  const future = useMemo(
    () =>
      item?.eventos
        .filter((event) => event.estado === "PROGRAMADO" && isUpcoming(event.fecha_inicio))
        .sort((a, b) => Date.parse(a.fecha_inicio) - Date.parse(b.fecha_inicio))[0],
    [item],
  );

  async function openContractCopy(documentId: number, filename: string, download: boolean) {
    if (!token || contractAction) return;
    setContractAction({ id: documentId, type: download ? "download" : "view" });
    setError("");
    try {
      const blob = await fetchBlobApi(`/api/expedientes/documentos/${documentId}/archivo`, { token });
      const url = URL.createObjectURL(blob);
      if (download) {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible abrir el contrato firmado.");
    } finally {
      setContractAction(null);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-64 place-items-center text-sm text-muted">
        <div className="flex items-center gap-2">
          <RefreshCw className="size-4 animate-spin text-brand-700" />
          <span>Cargando expediente...</span>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <section className="mx-auto max-w-4xl space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/gestion-procesos/cliente/procesos")}
          icon={<ArrowLeft className="size-4" />}
        >
          Volver a mis procesos
        </Button>
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-4 text-sm font-medium text-risk">
          {error || "No se encontró el proceso."}
        </div>
      </section>
    );
  }

  const pendingRequests = item.solicitudes_documento.filter((request) => !request.atendida_en);
  const myOpenTasks = item.tareas.filter((task) => task.estado === "PENDIENTE" || task.estado === "EN_CURSO");
  const lawyerPhone = (item.responsable.whatsapp_numero || "").replace(/\D/g, "");
  const whatsappNumber = lawyerPhone.length === 10 && lawyerPhone.startsWith("3") ? `57${lawyerPhone}` : lawyerPhone;
  const upcomingEvents = item.eventos.filter((event) => event.estado === "PROGRAMADO" && isUpcoming(event.fecha_inicio));
  const otherFiles = item.documentos.filter((doc) => !doc.contrato_id);

  const tabs: { value: ClientTab; label: string; count?: number }[] = [
    { value: "novedades", label: "Novedades" },
    { value: "documentos", label: "Documentos", count: pendingRequests.length || undefined },
    { value: "tareas", label: "Tareas", count: myOpenTasks.length || undefined },
    { value: "agenda", label: "Agenda", count: upcomingEvents.length || undefined },
    { value: "mensajes", label: "Mensajes" },
    { value: "equipo", label: "Equipo" },
  ];

  return (
    <section className="mx-auto max-w-5xl space-y-5">
      <Link href="/gestion-procesos/cliente/procesos" className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted hover:text-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Mis procesos
      </Link>

      <header className="rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-xs)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">Tu proceso</p>
            <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{item.nombre}</h1>
          </div>
          <Badge tone="completed" className="px-3 py-1 text-sm">{item.estado_visible}</Badge>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground-secondary">{item.explicacion_estado}</p>
        {item.descripcion && <p className="mt-2 text-sm text-foreground-muted">{item.descripcion}</p>}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Link
            href={`/gestion-procesos/cliente/chat/${item.id}/${item.responsable.id}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            <MessageCircle aria-hidden="true" className="size-4" />
            Escribir a {item.responsable.nombre_completo.split(" ")[0]}
          </Link>
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-border px-4 text-sm font-semibold text-foreground hover:bg-surface-hover"
            >
              <Phone aria-hidden="true" className="size-4 text-success" />
              WhatsApp
            </a>
          )}
        </div>
      </header>

      {error && <div role="alert" className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light p-3.5 text-sm font-medium text-danger">{error}</div>}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Lo primero que el cliente necesita saber: qué falta de su parte. */}
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Lo que necesitamos de ti</h2>
          {pendingRequests.length || myOpenTasks.length ? (
            <ul className="mt-3 space-y-2.5">
              {pendingRequests.map((request) => {
                const delivered = request.documentos_requeridos.filter((doc) => doc.documento).length;
                return (
                  <li key={`solicitud-${request.id}`}>
                    <Link href={`/gestion-procesos/cliente/documentos#solicitud-${request.id}`} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning-light/60 p-3 hover:border-warning">
                      <FileText aria-hidden="true" className="size-5 shrink-0 text-warning" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">{request.titulo}</span>
                        <span className="block text-xs text-foreground-secondary">
                          Entregados {delivered} de {request.documentos_requeridos.length}
                          {request.fecha_limite ? ` · antes del ${formatDate(request.fecha_limite)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">Entregar</span>
                    </Link>
                  </li>
                );
              })}
              {myOpenTasks.map((task) => (
                <li key={`tarea-${task.id}`}>
                  <Link href={`/gestion-procesos/cliente/tareas?tarea=${task.id}#tarea-${task.id}`} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3 hover:border-primary">
                    <ListChecks aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{task.titulo}</span>
                      <span className={`block text-xs ${isOverdue(task.fecha_limite, task.estado) ? "font-semibold text-danger" : "text-foreground-secondary"}`}>
                        {task.fecha_limite ? `${isOverdue(task.fecha_limite, task.estado) ? "Venció el" : "Antes del"} ${formatDate(task.fecha_limite)}` : "Sin fecha límite"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-primary">Ver</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-success-light p-3 text-sm font-medium text-success">
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
              Estás al día. No tienes documentos ni tareas pendientes en este proceso.
            </p>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <CalendarDays aria-hidden="true" className="size-4 text-primary" />
            Próxima cita
          </h2>
          {future ? (
            <>
              <p className="mt-3 text-sm font-semibold text-foreground">{future.titulo}</p>
              <p className="mt-0.5 text-sm text-foreground-secondary">{formatDateTime(future.fecha_inicio)}</p>
              {future.descripcion && <p className="mt-1 text-xs text-foreground-muted">{future.descripcion}</p>}
            </>
          ) : <p className="mt-3 text-sm text-foreground-muted">No tienes citas ni audiencias programadas.</p>}
          <Link href="/gestion-procesos/cliente/calendario" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Ver mi calendario</Link>
        </section>
      </div>

      <SegmentedControl label="Secciones del proceso" value={tab} onChange={setTab} options={tabs} />

      {tab === "novedades" && (
        <div className="space-y-4">
          {item.radicados.length > 0 && (
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
              <h2 className="text-base font-semibold text-foreground">Estado judicial</h2>
              <ul className="mt-3 space-y-3">
                {item.radicados.map((radicado) => (
                  <li id={`radicado-${radicado.id}`} key={radicado.id} className="rounded-[var(--radius-md)] border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-sm font-semibold text-foreground">{radicado.numero}</p>
                      <Badge tone="normal">{radicado.estado_visible}</Badge>
                    </div>
                    {radicado.actuaciones[0] ? (
                      <p id={`actuacion-${radicado.actuaciones[0].id}`} className="mt-2 text-sm text-foreground-secondary">
                        Última novedad: <span className="font-medium text-foreground">{radicado.actuaciones[0].descripcion || "Actualización judicial"}</span>
                        <span className="block text-xs text-foreground-muted">{radicado.actuaciones[0].fecha}</span>
                      </p>
                    ) : <p className="mt-2 text-xs text-foreground-muted">Aún no hay novedades registradas.</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section id="actividad" className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
            <h2 className="text-base font-semibold text-foreground">Actualizaciones recientes</h2>
            {item.timeline.length ? (
              <ol className="relative mt-4 space-y-4 border-l border-border pl-5">
                {item.timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span aria-hidden="true" className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-surface" />
                    <p className="text-sm font-medium text-foreground">{entry.titulo}</p>
                    {entry.descripcion && <p className="mt-0.5 text-sm text-foreground-secondary">{entry.descripcion}</p>}
                    <p className="mt-0.5 text-xs text-foreground-muted">{dateText(entry.fecha)}{entry.actor ? ` · ${entry.actor}` : ""}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-foreground-muted">Aún no hay actualizaciones.</p>}
          </section>
        </div>
      )}

      {tab === "documentos" && (
        <section id="documentos" className="space-y-3">
          {item.solicitudes_documento.map((request) => (
            <article key={`r${request.id}`} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">{request.titulo}</h2>
                  {request.instrucciones && <p className="mt-0.5 text-xs text-foreground-muted">{request.instrucciones}</p>}
                </div>
                <Badge tone={request.atendida_en ? "completed" : "pending"}>{request.atendida_en ? "Entregada" : "Pendiente"}</Badge>
              </div>
              <ul className="mt-3 divide-y divide-border rounded-[var(--radius-md)] border border-border">
                {request.documentos_requeridos.map((requested) => (
                  <li key={requested.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{requested.nombre}</p>
                      {requested.documento?.nombre_archivo && <p className="truncate text-xs text-foreground-muted">{requested.documento.nombre_archivo}</p>}
                      {requested.documento?.comentario_revision && <p className="mt-0.5 text-xs text-danger">Observación: {requested.documento.comentario_revision}</p>}
                    </div>
                    <Badge tone={requested.documento ? reviewStatusLabel(requested.estado).tone : "pending"}>{requested.documento ? reviewStatusLabel(requested.estado).label : "Falta"}</Badge>
                  </li>
                ))}
              </ul>
              {!request.atendida_en && (
                <Link href={`/gestion-procesos/cliente/documentos#solicitud-${request.id}`} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  <Upload aria-hidden="true" className="size-4" />
                  Entregar documentos
                </Link>
              )}
            </article>
          ))}
          {otherFiles.length > 0 && (
            <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
              <h2 className="text-sm font-semibold text-foreground">Archivos entregados</h2>
              <ul className="mt-2 divide-y divide-border">
                {otherFiles.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-foreground"><FileText aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="truncate">{doc.nombre_archivo}</span></span>
                    <Badge tone={reviewStatusLabel(doc.estado_revision).tone}>{reviewStatusLabel(doc.estado_revision).label}</Badge>
                  </li>
                ))}
              </ul>
            </article>
          )}
          {item.contratos.length > 0 && (
            <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
              <h2 className="text-sm font-semibold text-foreground">Contratos firmados</h2>
              <ul className="mt-2 divide-y divide-border">
                {item.contratos.map((contract) => (
                  <li key={contract.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Contrato #{contract.id} · {contract.estado === "TERMINADO" ? "Terminado" : "Firmado"}</p>
                      <p className="text-xs text-foreground-muted">Firmado {dateText(contract.firmado_en)} · Versión {contract.version_actual}</p>
                    </div>
                    {contract.documento_firmado && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => void openContractCopy(contract.documento_firmado!.id, contract.documento_firmado!.nombre_archivo, false)} disabled={contractAction !== null} loading={contractAction?.id === contract.documento_firmado.id && contractAction.type === "view"} icon={<Eye className="size-4" />}>Ver</Button>
                        <Button variant="outline" size="sm" onClick={() => void openContractCopy(contract.documento_firmado!.id, contract.documento_firmado!.nombre_archivo, true)} disabled={contractAction !== null} loading={contractAction?.id === contract.documento_firmado.id && contractAction.type === "download"} icon={<Download className="size-4" />}>Descargar</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          )}
          {!item.solicitudes_documento.length && !otherFiles.length && !item.contratos.length && (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-6 text-center text-sm text-foreground-muted">No hay documentos en este proceso.</p>
          )}
        </section>
      )}

      {tab === "tareas" && (
        <section id="tareas" className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          {item.tareas.length ? (
            <ul className="divide-y divide-border">
              {item.tareas.map((task) => (
                <li key={task.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{task.titulo}</p>
                    <Badge tone={taskStatusLabel(task.estado).tone}>{taskStatusLabel(task.estado).label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {task.asignada_a_cliente ? "Asignada a ti" : "Tienes asignada una parte; el resto lo gestiona el despacho"}
                    {task.fecha_limite ? ` · Límite: ${formatDate(task.fecha_limite)}` : ""}
                  </p>
                  {task.descripcion && <p className="mt-1 text-sm text-foreground-secondary">{task.descripcion}</p>}
                  {task.subtareas.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {task.subtareas.map((subtask) => (
                        <li key={subtask.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 aria-hidden="true" className={`size-4 ${subtask.completada ? "text-success" : "text-border-strong"}`} />
                          <span className={subtask.completada ? "text-foreground-muted line-through" : "text-foreground"}>{subtask.titulo}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-foreground-muted">No tienes tareas asignadas en este proceso.</p>}
          <Link href="/gestion-procesos/cliente/tareas" className="mt-4 inline-block text-xs font-semibold text-primary hover:underline">Ir a mis tareas</Link>
        </section>
      )}

      {tab === "agenda" && (
        <section id="agenda" className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          {item.eventos.length ? (
            <ul className="divide-y divide-border">
              {[...item.eventos].sort((left, right) => Date.parse(right.fecha_inicio) - Date.parse(left.fecha_inicio)).map((event) => (
                <li id={`evento-${event.id}`} key={event.id} className="scroll-mt-24 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{event.titulo}</p>
                      <p className="mt-0.5 text-xs text-foreground-muted">{eventTypeLabel(event.tipo)} · {dateText(event.fecha_inicio)}</p>
                      {event.descripcion && <p className="mt-1 text-sm text-foreground-secondary">{event.descripcion}</p>}
                    </div>
                    <Badge tone={event.estado === "PROGRAMADO" ? "normal" : event.estado === "COMPLETADO" ? "completed" : "archived"}>{eventStatusLabel(event.estado)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-foreground-muted">No hay citas ni audiencias en este proceso.</p>}
        </section>
      )}

      {tab === "mensajes" && (
        <section id="comunicacion" className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)] sm:p-5">
          <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {item.comunicaciones.length ? item.comunicaciones.map((message) => (
              <article key={message.id} className={`max-w-[88%] rounded-[var(--radius-lg)] border p-3 text-sm ${message.es_mio ? "ml-auto border-primary/20 bg-primary-light" : "border-border bg-surface-muted"}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <strong className="font-semibold text-foreground">{message.es_mio ? "Tú" : message.remitente}</strong>
                  <time className="text-foreground-muted">{dateText(message.created_at)}</time>
                </div>
                {message.asunto && <p className="font-semibold text-foreground">{message.asunto}</p>}
                <p className="whitespace-pre-wrap text-foreground-secondary">{message.contenido}</p>
              </article>
            )) : <p className="text-sm text-foreground-muted">Aún no hay mensajes en este proceso.</p>}
          </div>
          <Link href={`/gestion-procesos/cliente/chat/${item.id}/${item.responsable.id}`} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 text-sm font-semibold text-primary-foreground">
            <MessageCircle aria-hidden="true" className="size-4" />
            Abrir el chat
          </Link>
        </section>
      )}

      {tab === "equipo" && (
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
            <p className="flex items-center gap-2 text-xs font-medium text-foreground-muted"><UserRound aria-hidden="true" className="size-4" />Abogado responsable</p>
            <p className="mt-2 font-semibold text-foreground">{item.responsable.nombre_completo}</p>
            <p className="text-xs text-foreground-muted">{item.responsable.cargo}</p>
            <a href={`mailto:${item.responsable.email}`} className="mt-3 flex items-center gap-2 break-all text-sm text-primary hover:underline"><Mail aria-hidden="true" className="size-4 shrink-0" />{item.responsable.email}</a>
            {whatsappNumber && <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 text-sm text-primary hover:underline"><Phone aria-hidden="true" className="size-4 shrink-0" />WhatsApp directo</a>}
          </article>
          {item.abogados_participantes.length > 0 && (
            <article className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
              <p className="text-xs font-medium text-foreground-muted">También trabajan en tu proceso</p>
              <ul className="mt-2 space-y-1.5">
                {item.abogados_participantes.map((lawyer) => <li key={lawyer.nombre_completo} className="text-sm font-medium text-foreground">{lawyer.nombre_completo}</li>)}
              </ul>
            </article>
          )}
        </section>
      )}
    </section>
  );
}

function eventTypeLabel(type: string) {
  return ({ AUDIENCIA: "Audiencia", REUNION: "Reunión", FIRMA_CONTRATO: "Firma de contrato", EVENTO: "Evento" } as Record<string, string>)[type] ?? type.replaceAll("_", " ").toLowerCase();
}

function eventStatusLabel(status: string) {
  return ({ PROGRAMADO: "Programado", COMPLETADO: "Realizado", CANCELADO: "Cancelado" } as Record<string, string>)[status] ?? status;
}
