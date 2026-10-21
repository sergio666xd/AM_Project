"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  UserRound,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi, fetchBlobApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
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

export default function DetalleProcesoClientePage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { token } = useSession();
  const [item, setItem] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const [contractAction, setContractAction] = useState<{ id: number; type: "view" | "download" } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItem(await fetchApi(`/api/expedientes/cliente/procesos/${id}`, { token }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar el proceso.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

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
    requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ block: "start" }));
  }, [item]);

  const future = useMemo(
    () =>
      item?.eventos
        .filter((event) => event.estado === "PROGRAMADO" && isUpcoming(event.fecha_inicio))
        .sort((a, b) => Date.parse(a.fecha_inicio) - Date.parse(b.fecha_inicio))[0],
    [item],
  );

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !item) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSending(true);
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/expedientes/cliente/procesos/${item.id}/comunicaciones`, {
        method: "POST",
        token,
        body: JSON.stringify({
          asunto: String(form.get("asunto") || ""),
          contenido: String(form.get("contenido") || ""),
        }),
      });
      formElement.reset();
      setNotice("Mensaje enviado al despacho.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

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

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/gestion-procesos/cliente/procesos")}
          icon={<ArrowLeft className="size-4" />}
        >
          Mis procesos
        </Button>
      </div>

      <header className="rounded-xl border border-border bg-surface p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
              Expediente judicial
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {item.nombre}
            </h1>
            {item.descripcion && (
              <p className="mt-2 text-sm text-muted leading-relaxed">
                {item.descripcion}
              </p>
            )}
          </div>
          <Badge tone="completed" className="px-3 py-1 text-sm font-medium">
            {item.estado_visible}
          </Badge>
        </div>

        <div className="mt-4 rounded-lg bg-surface-secondary/80 p-3.5 text-sm text-foreground leading-relaxed border border-border/50">
          <span className="font-semibold text-brand-900 dark:text-brand-200">Estado del proceso: </span>
          {item.explicacion_estado}
        </div>

        <nav className="mt-5 flex flex-wrap gap-2 text-xs font-medium" aria-label="Secciones del expediente">
          {[
            ["#actividad", "Actividad"],
            ["#agenda", "Agenda"],
            ["#documentos", "Documentos"],
            ["#tareas", "Tareas"],
            ["#radicados", "Radicados"],
            ["#comunicacion", "Chat"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-muted transition hover:border-brand-500 hover:text-foreground shadow-2xs"
            >
              {label}
            </a>
          ))}
        </nav>
      </header>

      {/* CHAT BANNER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4.5 dark:border-brand-900/60 dark:bg-brand-950/40 shadow-xs">
        <div>
          <h2 className="font-semibold text-brand-950 dark:text-brand-100">Chat directo del proceso</h2>
          <p className="mt-0.5 text-xs text-brand-800/80 dark:text-brand-300">
            Conversa directamente con tu abogado a cargo: {item.responsable.nombre_completo}.
          </p>
        </div>
        <Link href={`/gestion-procesos/cliente/chat/${item.id}/${item.responsable.id}`}>
          <Button variant="primary" icon={<MessageCircle className="size-4" />}>
            Abrir chat
          </Button>
        </Link>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-completed/30 bg-completed/10 p-3.5 text-sm font-medium text-completed">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <main className="space-y-6">
          {/* ACTIVIDAD / TIMELINE */}
          <section id="actividad" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <h2 className="font-semibold text-foreground text-base">Actualizaciones recientes</h2>
            <ol className="mt-4 space-y-4 border-l-2 border-brand-200 dark:border-brand-900 ml-2 pl-4">
              {item.timeline.length > 0 ? (
                item.timeline.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 size-2.5 rounded-full bg-brand-700" />
                    <p className="font-medium text-sm text-foreground">{entry.titulo}</p>
                    {entry.descripcion && (
                      <p className="mt-0.5 text-xs text-muted">{entry.descripcion}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted">
                      {dateText(entry.fecha)}
                      {entry.actor ? ` · ${entry.actor}` : ""}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted">Aún no hay actualizaciones disponibles en la línea de tiempo.</li>
              )}
            </ol>
          </section>

          {/* AGENDA */}
          <section id="agenda" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <h2 className="font-semibold text-foreground text-base">Agenda del proceso</h2>
            {item.eventos.length > 0 ? (
              <ul className="mt-3 divide-y divide-border">
                {item.eventos.map((event) => (
                  <li id={`evento-${event.id}`} key={event.id} className="scroll-mt-24 py-3 first:pt-2 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm text-foreground">{event.titulo}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {event.tipo.replaceAll("_", " ")} · {dateText(event.fecha_inicio)}
                        </p>
                        {event.descripcion && (
                          <p className="mt-1 text-xs text-muted leading-relaxed">{event.descripcion}</p>
                        )}
                      </div>
                      <Badge tone="normal">{event.estado.replaceAll("_", " ")}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted">No hay actividades programadas asociadas a este proceso.</p>
            )}
          </section>

          {/* DOCUMENTOS */}
          <section id="documentos" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-semibold text-foreground text-base">Documentos</h2>
              <Link href="/gestion-procesos/cliente/documentos" className="text-xs font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300">
                Centro documental →
              </Link>
            </div>
            <div className="mt-3 divide-y divide-border">
              {item.solicitudes_documento.map((request) => (
                <div key={`r${request.id}`} className="py-3">
                  <p className="font-medium text-sm text-foreground">{request.titulo}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {request.estado.replaceAll("_", " ")}
                    {request.instrucciones ? ` · ${request.instrucciones}` : ""}
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs bg-surface-secondary/60 rounded-lg p-3">
                    {request.documentos_requeridos.map((requested) => (
                      <li key={requested.id} className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{requested.nombre}</span>
                        <span className="text-muted">
                          {requested.estado.replaceAll("_", " ")}
                          {requested.documento?.nombre_archivo && ` (${requested.documento.nombre_archivo})`}
                        </span>
                        {requested.documento?.comentario_revision && (
                          <span className="block text-risk">Observación: {requested.documento.comentario_revision}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {item.documentos
                .filter((doc) => !doc.contrato_id)
                .map((doc) => (
                  <div key={`d${doc.id}`} className="py-3 flex items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 font-medium text-sm text-foreground">
                      <FileText className="size-4 text-brand-700 dark:text-brand-400" />
                      {doc.nombre_archivo}
                    </p>
                    <Badge tone="normal">{doc.estado_revision.replaceAll("_", " ")}</Badge>
                  </div>
                ))}
              {item.contratos.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <h3 className="font-semibold text-sm text-foreground">Contratos del expediente</h3>
                  <div className="mt-2 divide-y divide-border">
                    {item.contratos.map((contract) => (
                      <div key={contract.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div>
                          <p className="font-medium text-sm text-foreground">
                            Contrato #{contract.id} · {contract.estado === "TERMINADO" ? "Terminado" : "Firmado"}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            Firmado {dateText(contract.firmado_en)} · Versión {contract.version_actual}
                          </p>
                        </div>
                        {contract.documento_firmado && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void openContractCopy(
                                  contract.documento_firmado!.id,
                                  contract.documento_firmado!.nombre_archivo,
                                  false,
                                )
                              }
                              disabled={contractAction !== null}
                              loading={contractAction?.id === contract.documento_firmado!.id && contractAction.type === "view"}
                              icon={<Eye className="size-4" />}
                            >
                              Ver
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void openContractCopy(
                                  contract.documento_firmado!.id,
                                  contract.documento_firmado!.nombre_archivo,
                                  true,
                                )
                              }
                              disabled={contractAction !== null}
                              loading={contractAction?.id === contract.documento_firmado!.id && contractAction.type === "download"}
                              icon={<Download className="size-4" />}
                            >
                              Descargar
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!item.solicitudes_documento.length && !item.documentos.length && !item.contratos.length && (
                <p className="py-3 text-xs text-muted">No hay documentos asociados a este expediente.</p>
              )}
            </div>
          </section>

          {/* TAREAS */}
          <section id="tareas" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="font-semibold text-foreground text-base">Tareas</h2>
              <Link href="/gestion-procesos/cliente/tareas" className="text-xs font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300">
                Ver tareas →
              </Link>
            </div>
            {item.tareas.length > 0 ? (
              <ul className="mt-3 divide-y divide-border">
                {item.tareas.map((task) => (
                  <li key={task.id} className="py-3 first:pt-2 last:pb-0">
                    <p className="font-medium text-sm text-foreground">{task.titulo}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {task.asignada_a_cliente
                        ? "Tarea principal asignada a ti"
                        : "Solo tienes asignada una subtarea; la tarea principal sigue a cargo del despacho"}
                    </p>
                    {task.descripcion && (
                      <p className="text-xs text-muted mt-1 leading-relaxed">{task.descripcion}</p>
                    )}
                    {task.subtareas.length > 0 && (
                      <ul className="mt-2 space-y-1 border-l-2 border-border pl-3 text-xs">
                        {task.subtareas.map((subtask) => (
                          <li key={subtask.id} className="text-muted">
                            <span className="text-foreground">{subtask.titulo}</span> ·{" "}
                            {subtask.completada ? "Completada" : "Pendiente"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1.5 text-xs text-muted">
                      {task.estado.replaceAll("_", " ")} · Límite: {dateText(task.fecha_limite)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted">No tienes tareas asignadas en este proceso.</p>
            )}
          </section>

          {/* RADICADOS */}
          <section id="radicados" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <h2 className="font-semibold text-foreground text-base">Radicados y novedades judiciales</h2>
            {item.radicados.length > 0 ? (
              item.radicados.map((radicado) => (
                <article
                  id={`radicado-${radicado.id}`}
                  key={radicado.id}
                  className="mt-3.5 rounded-lg border border-border bg-surface-secondary/40 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
                    <p className="font-mono text-sm font-semibold text-foreground">{radicado.numero}</p>
                    <Badge tone="normal">{radicado.estado_visible}</Badge>
                  </div>
                  {radicado.actuaciones.length > 0 ? (
                    <ul className="mt-3 space-y-3">
                      {radicado.actuaciones.map((action) => (
                        <li id={`actuacion-${action.id}`} key={action.id} className="text-xs">
                          <p className="text-foreground leading-relaxed">{action.descripcion || "Actualización judicial"}</p>
                          <p className="text-[11px] text-muted mt-0.5">{action.fecha}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2.5 text-xs text-muted">No hay novedades registradas todavía.</p>
                  )}
                </article>
              ))
            ) : (
              <p className="mt-3 text-xs text-muted">Este proceso aún no tiene radicados judiciales vinculados.</p>
            )}
          </section>

          {/* COMUNICACIONES */}
          <section id="comunicacion" className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <h2 className="font-semibold text-foreground text-base">Conversación con el despacho</h2>
            <div className="mt-3.5 max-h-96 space-y-3 overflow-y-auto pr-1">
              {item.comunicaciones.length > 0 ? (
                item.comunicaciones.map((message) => (
                  <article
                    key={message.id}
                    className={`max-w-[88%] rounded-xl p-3.5 text-xs ${
                      message.es_mio
                        ? "ml-auto bg-brand-50 text-brand-950 dark:bg-brand-950/70 dark:text-brand-100 border border-brand-200 dark:border-brand-900"
                        : "bg-surface-secondary text-foreground border border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 mb-1.5">
                      <strong className="font-semibold text-foreground">
                        {message.es_mio ? "Tú" : message.remitente}
                      </strong>
                      <time className="text-[10px] text-muted">{dateText(message.created_at)}</time>
                    </div>
                    {message.asunto && <p className="font-semibold mb-1">{message.asunto}</p>}
                    <p className="whitespace-pre-wrap leading-relaxed">{message.contenido}</p>
                  </article>
                ))
              ) : (
                <p className="text-xs text-muted">Aún no hay mensajes compartidos.</p>
              )}
            </div>
          </section>
        </main>

        {/* ASIDE */}
        <aside className="space-y-5">
          {/* TU ABOGADO */}
          <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-border pb-3">
              <UserRound className="size-4 text-brand-700 dark:text-brand-400" />
              <h2 className="font-semibold text-foreground">Tu abogado responsable</h2>
            </div>
            <p className="mt-3 font-semibold text-foreground text-sm">{item.responsable.nombre_completo}</p>
            <p className="text-xs text-muted mt-0.5">{item.responsable.cargo}</p>
            <a
              className="mt-3 block break-all text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
              href={`mailto:${item.responsable.email}`}
            >
              {item.responsable.email}
            </a>
            {item.responsable.whatsapp_numero && (
              <a
                className="mt-3.5 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-hover shadow-2xs"
                href={`https://wa.me/${item.responsable.whatsapp_numero.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4 text-emerald-600" />
                WhatsApp directo
              </a>
            )}
          </section>

          {/* ABOGADOS PARTICIPANTES */}
          {item.abogados_participantes.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
              <h2 className="font-semibold text-foreground border-b border-border pb-3 text-sm">
                Abogados participantes
              </h2>
              <ul className="mt-3 space-y-2 text-xs text-foreground">
                {item.abogados_participantes.map((lawyer) => (
                  <li key={lawyer.nombre_completo} className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-brand-700" />
                    <span>{lawyer.nombre_completo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* PRÓXIMA CITA */}
          {future && (
            <section className="rounded-xl border border-border bg-surface p-5 shadow-xs">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <CalendarDays className="size-4 text-brand-700 dark:text-brand-400" />
                <h2 className="font-semibold text-foreground text-sm">Próxima cita</h2>
              </div>
              <p className="mt-3 font-semibold text-foreground text-sm">{future.titulo}</p>
              <p className="text-xs text-muted mt-0.5">{dateText(future.fecha_inicio)}</p>
              <Link
                href="/gestion-procesos/cliente/calendario"
                className="mt-3.5 inline-block text-xs font-semibold text-brand-700 hover:text-brand-900 dark:text-brand-300"
              >
                Ver calendario completo →
              </Link>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
