"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Download,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  RefreshCw,
  ScrollText,
  UserRound,
  Users,
} from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest, fetchApi, iniciarWorkflowConsultaRadicado } from "@/lib/api";
import { useNow } from "@/lib/useNow";
import {
  consultaLabel,
  formatDate,
  formatDateTime,
  formatRelative,
  isOverdue,
  priorityLabel,
  priorityRank,
  reviewStatusLabel,
  taskStatusLabel,
  toDate,
} from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SummaryStrip } from "@/components/ui/SummaryStrip";
import { useToast } from "@/components/ui/ToastProvider";

type Person = { id: number; nombre_completo: string };
type Client = Person & { email?: string | null; whatsapp_numero?: string | null; numero_documento?: string | null; direccion?: string | null };
type Actuation = { id: number; fecha_actuacion: string; actuacion: string; anotacion?: string | null };
type Radicado = { id: number; numero: string; estado_consulta: string; actuaciones: Actuation[] };
type Task = { id: number; titulo: string; descripcion?: string | null; estado: string; prioridad: string; cliente_id?: number | null; fecha_limite?: string | null; responsable?: string | null };
type DocumentRow = { id: number; nombre_archivo: string; cliente: string; mime_type: string; estado_revision: string; comentario_revision?: string | null; created_at: string; contrato_id?: number | null };
type DocumentRequest = { id: number; titulo: string; cliente: string; atendida_en?: string | null; created_at: string; estado: string; documentos_requeridos?: { id: string; nombre: string; estado: string }[] };
type Contract = { id: number; cliente: string; estado: string; version_actual: number; emitido_en?: string | null; firmado_en?: string | null; terminado_en?: string | null };
type TimelineItem = { id: string; tipo: string; titulo: string; descripcion: string; actor?: string | null; recurso: string; visibilidad: string; fecha?: string | null };
type AgendaEvent = { id: number; titulo: string; tipo: string; estado: string; fecha_inicio: string; responsable?: string | null; cliente?: string | null };
type Communication = { id: number; asunto?: string | null; contenido: string; visibilidad: string; canal?: string | null; cliente?: string | null; actor?: string | null; created_at: string };

type ProcessDetail = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  responsable: Person;
  colaboradores: (Person & { visible_cliente: boolean })[];
  radicados: Radicado[];
  clientes: Client[];
  tareas: Task[];
  solicitudes_documento: DocumentRequest[];
  documentos: DocumentRow[];
  contratos: Contract[];
  comunicaciones: Communication[];
  timeline: TimelineItem[];
  eventos: AgendaEvent[];
};

type Tab = "resumen" | "tareas" | "radicados" | "documentos" | "contratos" | "actividad";

function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-xs)]">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon && <span aria-hidden="true" className="text-primary [&>svg]:size-4">{icon}</span>}
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const contractStatus: Record<string, string> = {
  BORRADOR: "Borrador",
  EMITIDO: "Emitido",
  FIRMADO: "Firmado",
  TERMINADO: "Terminado",
  ANULADO: "Anulado",
};

export default function AdminProcessDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { token } = useSession();
  const { toast } = useToast();
  const now = useNow();
  const [process, setProcess] = useState<ProcessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>("resumen");
  const [working, setWorking] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi(`/api/expedientes/procesos/${encodeURIComponent(id)}`, { token })
      .then((data: ProcessDetail) => {
        if (!active) return;
        setProcess(data);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey, token]);

  const load = () => {
    setLoading(true);
    setReloadKey((current) => current + 1);
  };

  const metrics = useMemo(() => {
    if (!process) return null;
    const openTasks = process.tareas.filter((task) => task.estado === "PENDIENTE" || task.estado === "EN_CURSO");
    return {
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((task) => isOverdue(task.fecha_limite, task.estado, now)).length,
      pendingRequests: process.solicitudes_documento.filter((request) => !request.atendida_en).length,
      toReview: process.documentos.filter((document) => document.estado_revision === "RECIBIDO").length,
      actuations: process.radicados.reduce((total, radicado) => total + radicado.actuaciones.length, 0),
      upcoming: process.eventos.filter((event) => event.estado === "PROGRAMADO" && (toDate(event.fecha_inicio)?.getTime() ?? 0) >= now),
    };
  }, [now, process]);

  async function archive() {
    if (!token || !process) return;
    if (!window.confirm(`¿Archivar “${process.nombre}”? Podrás restaurarlo desde Procesos › Archivados.`)) return;
    setWorking(true);
    try {
      await apiRequest(`/api/admin/inventario/procesos/${process.id}?sector=GLOBAL`, { method: "DELETE", token });
      toast({ tone: "success", title: "Proceso archivado" });
      router.push("/gestion-procesos/admin/procesos");
    } catch (cause) {
      toast({ tone: "error", title: "No se pudo archivar", description: cause instanceof Error ? cause.message : undefined });
    } finally {
      setWorking(false);
    }
  }

  async function consultRadicados() {
    if (!token || !process?.radicados.length) return;
    setWorking(true);
    try {
      await iniciarWorkflowConsultaRadicado(token, { tipo: "MANUAL", radicado_ids: process.radicados.map((radicado) => radicado.id) });
      toast({ tone: "success", title: "Consulta iniciada", description: "Las actuaciones nuevas aparecerán al terminar la consulta." });
    } catch (cause) {
      toast({ tone: "error", title: "No se pudo consultar", description: cause instanceof Error ? cause.message : undefined });
    } finally {
      setWorking(false);
    }
  }

  async function downloadDocument(document: DocumentRow) {
    if (!token) return;
    try {
      const response = await apiRequest(`/api/expedientes/documentos/${document.id}/archivo`, { token });
      const url = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.nombre_archivo || "documento";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      toast({ tone: "error", title: "No se pudo descargar", description: cause instanceof Error ? cause.message : undefined });
    }
  }

  if (loading && !process) {
    return <div className="mx-auto max-w-6xl"><LoadingState label="Cargando proceso" rows={6} /></div>;
  }
  if (error || !process || !metrics) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/gestion-procesos/admin/procesos" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" /> Volver a procesos
        </Link>
        <ApiErrorState error={error} onRetry={load} />
      </div>
    );
  }

  const taskColumns: DataTableColumn<Task>[] = [
    { key: "titulo", header: "Tarea", mobile: "title", sortValue: (task) => task.titulo, searchValue: (task) => `${task.titulo} ${task.descripcion ?? ""} ${task.responsable ?? ""}`, render: (task) => <span className="font-medium text-foreground">{task.titulo}</span> },
    { key: "estado", header: "Estado", mobile: "badge", sortValue: (task) => taskStatusLabel(task.estado).label, render: (task) => <Badge tone={taskStatusLabel(task.estado).tone}>{taskStatusLabel(task.estado).label}</Badge> },
    { key: "prioridad", header: "Prioridad", mobile: "badge", sortValue: (task) => priorityRank(task.prioridad), render: (task) => <Badge tone={priorityLabel(task.prioridad).tone}>{priorityLabel(task.prioridad).label}</Badge> },
    { key: "fecha_limite", header: "Vence", mobile: "meta", sortValue: (task) => toDate(task.fecha_limite), render: (task) => task.fecha_limite ? <span className={isOverdue(task.fecha_limite, task.estado, now) ? "font-semibold text-danger" : ""}>{formatDate(task.fecha_limite)}</span> : <span className="text-foreground-muted">Sin fecha</span> },
    { key: "responsable", header: "Responsable", mobile: "meta", sortValue: (task) => task.responsable, render: (task) => task.responsable || "—" },
    { key: "cliente", header: "Para", mobile: "meta", hideOnMobile: true, sortValue: (task) => (task.cliente_id ? "Cliente" : "Equipo"), render: (task) => (task.cliente_id ? process.clientes.find((client) => client.id === task.cliente_id)?.nombre_completo ?? "Cliente" : "Equipo interno") },
  ];

  const documentColumns: DataTableColumn<DocumentRow>[] = [
    { key: "nombre_archivo", header: "Documento", mobile: "title", sortValue: (document) => document.nombre_archivo, searchValue: (document) => `${document.nombre_archivo} ${document.cliente}`, render: (document) => <span className="flex min-w-0 items-center gap-2"><FileText aria-hidden="true" className="size-4 shrink-0 text-primary" /><span className="truncate font-medium text-foreground">{document.nombre_archivo}</span></span>, className: "max-w-xs" },
    { key: "estado_revision", header: "Revisión", mobile: "badge", sortValue: (document) => reviewStatusLabel(document.estado_revision).label, render: (document) => <Badge tone={reviewStatusLabel(document.estado_revision).tone}>{reviewStatusLabel(document.estado_revision).label}</Badge> },
    { key: "cliente", header: "Cliente", mobile: "meta", sortValue: (document) => document.cliente, render: (document) => document.cliente },
    { key: "created_at", header: "Cargado", mobile: "meta", sortValue: (document) => toDate(document.created_at), render: (document) => formatDate(document.created_at) },
  ];

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "resumen", label: "Resumen" },
    { value: "tareas", label: "Tareas", count: process.tareas.length },
    { value: "radicados", label: "Radicados", count: process.radicados.length },
    { value: "documentos", label: "Documentos", count: process.documentos.length },
    { value: "contratos", label: "Contratos", count: process.contratos.length },
    { value: "actividad", label: "Actividad" },
  ];

  return (
    <div className="motion-swap mx-auto max-w-6xl space-y-5">
      <Link href="/gestion-procesos/admin/procesos" className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted hover:text-primary">
        <ArrowLeft aria-hidden="true" className="size-4" /> Procesos
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">Proceso #{process.id}</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-foreground sm:text-3xl">{process.nombre}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-muted">
            <span className="inline-flex items-center gap-1.5"><UserRound aria-hidden="true" className="size-4" />{process.responsable.nombre_completo}</span>
            {process.clientes.length > 0 && <span className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-4" />{process.clientes.map((client) => client.nombre_completo).join(", ")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={load} aria-label="Actualizar" icon={<RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />} />
          {process.radicados.length > 0 && (
            <Button variant="outline" disabled={working} onClick={() => void consultRadicados()} icon={<RefreshCw className="size-4" />}>
              Consultar radicados
            </Button>
          )}
          <Button variant="outline" disabled={working} onClick={() => void archive()} icon={<Archive className="size-4" />} className="text-danger">
            Archivar
          </Button>
        </div>
      </header>

      <SummaryStrip
        items={[
          { key: "tareas", label: "Tareas abiertas", value: metrics.openTasks },
          { key: "vencidas", label: "Tareas vencidas", value: metrics.overdueTasks, tone: metrics.overdueTasks ? "danger" : "default" },
          { key: "documentos", label: "Documentos por recibir o revisar", value: metrics.pendingRequests + metrics.toReview, tone: metrics.pendingRequests + metrics.toReview ? "warning" : "default" },
          { key: "actuaciones", label: "Actuaciones judiciales", value: metrics.actuations },
        ]}
      />

      <SegmentedControl label="Secciones del proceso" value={tab} onChange={setTab} options={tabs} />

      {tab === "resumen" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Descripción" icon={<ScrollText />}>
              <p className="whitespace-pre-wrap text-sm text-foreground-secondary">{process.descripcion || "Sin descripción registrada."}</p>
            </Section>
            <Section title="Próximas actividades" icon={<CalendarDays />}>
              {metrics.upcoming.length ? (
                <ul className="divide-y divide-border">
                  {metrics.upcoming.slice(0, 6).map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{event.titulo}</p>
                        <p className="text-xs text-foreground-muted">{[event.responsable, event.cliente].filter(Boolean).join(" · ") || event.tipo}</p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-foreground-secondary">{formatDateTime(event.fecha_inicio)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-foreground-muted">No hay audiencias ni eventos programados.</p>}
            </Section>
            <Section title="Comunicaciones recientes" icon={<MessageSquare />}>
              {process.comunicaciones.length ? (
                <ul className="space-y-3">
                  {process.comunicaciones.slice(0, 5).map((item) => (
                    <li key={item.id} className="rounded-[var(--radius-md)] bg-surface-muted p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                        <span className="font-medium text-foreground">{item.actor || "Sistema"}</span>
                        <span>{formatRelative(item.created_at, now)}</span>
                        <Badge tone={item.visibilidad === "CLIENTE" ? "completed" : "archived"}>{item.visibilidad === "CLIENTE" ? "Visible al cliente" : "Interna"}</Badge>
                      </div>
                      {item.asunto && <p className="mt-1 text-sm font-medium text-foreground">{item.asunto}</p>}
                      <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-foreground-secondary">{item.contenido}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-foreground-muted">Sin comunicaciones registradas.</p>}
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="Equipo" icon={<Users />}>
              <ul className="space-y-3">
                <li>
                  <p className="text-xs text-foreground-muted">Responsable</p>
                  <Link href={`/gestion-procesos/admin/usuarios/${process.responsable.id}`} className="text-sm font-medium text-foreground hover:text-primary hover:underline">{process.responsable.nombre_completo}</Link>
                </li>
                {process.colaboradores.map((member) => (
                  <li key={member.id}>
                    <p className="text-xs text-foreground-muted">Colaborador{member.visible_cliente ? " · visible al cliente" : ""}</p>
                    <Link href={`/gestion-procesos/admin/usuarios/${member.id}`} className="text-sm font-medium text-foreground hover:text-primary hover:underline">{member.nombre_completo}</Link>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Clientes" icon={<UserRound />}>
              {process.clientes.length ? (
                <ul className="space-y-4">
                  {process.clientes.map((client) => (
                    <li key={client.id} className="space-y-1">
                      <Link href={`/gestion-procesos/admin/usuarios/${client.id}`} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">{client.nombre_completo}</Link>
                      {client.numero_documento && <p className="text-xs text-foreground-muted">Documento {client.numero_documento}</p>}
                      {client.email && <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-primary"><Mail aria-hidden="true" className="size-3.5" />{client.email}</a>}
                      {client.whatsapp_numero && <a href={`tel:${client.whatsapp_numero}`} className="flex items-center gap-1.5 text-xs text-foreground-secondary hover:text-primary"><Phone aria-hidden="true" className="size-3.5" />{client.whatsapp_numero}</a>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-foreground-muted">Este proceso no tiene clientes vinculados.</p>}
            </Section>
          </div>
        </div>
      )}

      {tab === "tareas" && (
        <DataTable
          caption="Tareas del proceso"
          rows={process.tareas}
          columns={taskColumns}
          rowKey={(task) => task.id}
          rowTone={(task) => (isOverdue(task.fecha_limite, task.estado, now) ? "danger" : undefined)}
          initialSort={{ key: "fecha_limite", direction: "asc" }}
          searchPlaceholder="Buscar tarea"
          exportFilename={`tareas-proceso-${process.id}`}
          emptyTitle="Sin tareas"
          emptyDescription="Este proceso aún no tiene tareas registradas."
        />
      )}

      {tab === "radicados" && (
        process.radicados.length ? (
          <div className="space-y-3">
            {process.radicados.map((radicado) => {
              // La API ya las entrega por orden: la primera es la más reciente.
              const latest = radicado.actuaciones;
              return (
                <details key={radicado.id} className="group rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-xs)]">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
                    <span className="font-mono text-sm font-semibold text-foreground">{radicado.numero}</span>
                    <Badge tone={consultaLabel(radicado.estado_consulta).tone}>{consultaLabel(radicado.estado_consulta).label}</Badge>
                    <span className="text-xs text-foreground-muted">{radicado.actuaciones.length} actuaciones</span>
                    <ChevronDown aria-hidden="true" className="ml-auto size-4 text-foreground-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <ol className="divide-y divide-border border-t border-border">
                    {latest.slice(0, 30).map((actuation) => (
                      <li key={actuation.id} className="px-4 py-3">
                        <p className="text-xs font-medium text-foreground-muted">{actuation.fecha_actuacion || "Sin fecha"}</p>
                        <p className="mt-0.5 text-sm font-medium text-foreground">{actuation.actuacion || "Actuación"}</p>
                        {actuation.anotacion && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground-secondary">{actuation.anotacion}</p>}
                      </li>
                    ))}
                    {latest.length === 0 && <li className="px-4 py-6 text-center text-sm text-foreground-muted">Aún no hay actuaciones registradas.</li>}
                    {latest.length > 30 && <li className="px-4 py-3 text-center text-xs text-foreground-muted">Se muestran las 30 más recientes de {latest.length}.</li>}
                  </ol>
                </details>
              );
            })}
          </div>
        ) : <div className="rounded-[var(--radius-lg)] border border-border bg-surface"><EmptyState title="Sin radicados" description="Este proceso no tiene radicados judiciales asociados." /></div>
      )}

      {tab === "documentos" && (
        <div className="space-y-4">
          {process.solicitudes_documento.length > 0 && (
            <Section title="Solicitudes a clientes" icon={<FileText />}>
              <ul className="divide-y divide-border">
                {process.solicitudes_documento.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{request.titulo}</p>
                      <p className="text-xs text-foreground-muted">{request.cliente} · {formatDate(request.created_at)}</p>
                    </div>
                    <Badge tone={request.atendida_en ? "completed" : "pending"}>{request.atendida_en ? "Atendida" : "Pendiente"}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <DataTable
            caption="Documentos del proceso"
            rows={process.documentos}
            columns={documentColumns}
            rowKey={(document) => document.id}
            rowActions={[{ label: "Descargar", icon: <Download />, onSelect: (document) => downloadDocument(document) }]}
            initialSort={{ key: "created_at", direction: "desc" }}
            searchPlaceholder="Buscar documento"
            emptyTitle="Sin documentos"
            emptyDescription="Los clientes aún no han cargado documentos en este proceso."
          />
        </div>
      )}

      {tab === "contratos" && (
        process.contratos.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {process.contratos.map((contract) => (
              <li key={contract.id} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-[var(--shadow-xs)]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">Contrato #{contract.id}</p>
                    <p className="text-sm text-foreground-muted">{contract.cliente} · versión {contract.version_actual}</p>
                  </div>
                  <Badge tone={contract.estado === "FIRMADO" ? "completed" : contract.estado === "TERMINADO" || contract.estado === "ANULADO" ? "archived" : "pending"}>{contractStatus[contract.estado] ?? contract.estado}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-foreground-muted">Emitido</dt><dd className="text-foreground">{formatDate(contract.emitido_en)}</dd></div>
                  <div><dt className="text-foreground-muted">Firmado</dt><dd className="text-foreground">{formatDate(contract.firmado_en)}</dd></div>
                  <div><dt className="text-foreground-muted">Terminado</dt><dd className="text-foreground">{formatDate(contract.terminado_en)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        ) : <div className="rounded-[var(--radius-lg)] border border-border bg-surface"><EmptyState title="Sin contratos" description="No se han emitido contratos de servicios para este proceso." /></div>
      )}

      {tab === "actividad" && (
        <Section title="Línea de tiempo" icon={<CalendarDays />}>
          {process.timeline.length ? (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {process.timeline.slice(0, 150).map((item) => (
                <li key={item.id} className="relative">
                  <span aria-hidden="true" className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${item.visibilidad === "CLIENTE" ? "bg-success" : "bg-border-strong"}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.titulo}</p>
                    <span className="text-xs text-foreground-muted">{item.recurso}</span>
                  </div>
                  {item.descripcion && <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground-secondary">{item.descripcion}</p>}
                  <p className="mt-0.5 text-xs text-foreground-muted">{[item.actor, item.fecha ? formatDateTime(item.fecha) : null].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-foreground-muted">Aún no hay actividad registrada.</p>}
        </Section>
      )}
    </div>
  );
}
