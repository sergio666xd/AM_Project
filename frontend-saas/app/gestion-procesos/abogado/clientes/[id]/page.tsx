"use client";

import { apiRequest } from "@/lib/api";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Mail,
  MessageCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
  X,
} from "lucide-react";


type Client = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  genero?: "MASCULINO" | "FEMENINO" | null;
  numero_documento?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
  chat_href?: string | null;
  canal_notificacion_cliente?: "EMAIL" | "WHATSAPP" | null;
  notificaciones_email?: boolean;
  notificaciones_whatsapp?: boolean;
  estado_relacion: "ACTIVO" | "SIN_PROCESOS";
  ultimo_contacto?: string | null;
  procesos: {
    id: number;
    nombre: string;
  }[];
  tareas: {
    id: number;
    titulo: string;
    estado: string;
    fecha_limite?: string | null;
  }[];
  solicitudes_documento: {
    id: number;
    titulo: string;
    proceso: string;
    atendida_en?: string | null;
    created_at?: string;
  }[];
  actividad: { tipo: string; titulo: string; descripcion: string; fecha?: string | null; proceso_id?: number | null; proceso?: string | null; actor?: string | null; visibilidad: string }[];
  comunicaciones: { id: number; asunto: string; contenido: string; visibilidad: string; canal: string; created_at: string; proceso_id: number; proceso: string; actor: string }[];
};

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();

  const [client, setClient] = useState<Client | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [gender, setGender] = useState<"" | "MASCULINO" | "FEMENINO">("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [domicile, setDomicile] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest(
        `/api/expedientes/clientes/${id}`,
        {
          headers: headers(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible cargar el cliente."
        );
      }

      setClient(data);
      setName(data.nombre_completo || "");
      setWhatsapp(data.whatsapp_numero || "");
      setGender(data.genero || "");
      setDocumentNumber(data.numero_documento || "");
      setDomicile(data.domicilio || "");
      setAddress(data.direccion || "");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar el cliente."
      );
    } finally {
      setLoading(false);
    }
  }, [id, headers]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const initials = useMemo(() => {
    if (!client?.nombre_completo) return "?";

    const parts = client.nombre_completo
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${
      parts[parts.length - 1][0]
    }`.toUpperCase();
  }, [client]);

  const pendingTasks = useMemo(
    () =>
      client?.tareas.filter(
        (task) =>
          task.estado.toLowerCase() !== "completada" &&
          task.estado.toLowerCase() !== "completado"
      ).length || 0,
    [client]
  );

  const pendingDocuments = useMemo(
    () =>
      client?.solicitudes_documento.filter(
        (document) => !document.atendida_en
      ).length || 0,
    [client]
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await apiRequest(
        `/api/expedientes/clientes/${id}`,
        {
          method: "PUT",
          headers: {
            ...headers(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre_completo: name.trim(),
            whatsapp_numero: whatsapp.trim(),
            genero: gender || null,
            numero_documento: documentNumber.trim(),
            domicilio: domicile.trim(),
            direccion: address.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible actualizar el cliente."
        );
      }

      setNotice(data.mensaje || "Cliente actualizado correctamente.");

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al guardar los cambios."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !client) {
    return (
      <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <div className="h-5 w-24 animate-pulse rounded bg-surface-secondary" />

        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
          <div className="flex items-center gap-4">
            <div className="size-16 animate-pulse rounded-full bg-surface-secondary" />

            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-surface-secondary" />
              <div className="h-3 w-64 animate-pulse rounded bg-surface-secondary" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-[var(--radius-lg)] border border-border bg-surface-secondary"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!client) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/gestion-procesos/abogado/clientes"
          className="inline-flex items-center gap-2 text-sm text-brand-900"
        >
          <ArrowLeft className="size-4" />
          Volver a clientes
        </Link>

        <div className="mt-6 rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 p-6">
          <p className="font-medium text-red-700 dark:text-red-400">
            {error || "No fue posible encontrar el cliente."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Back */}
      <Link
        href="/gestion-procesos/abogado/clientes"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted transition hover:text-brand-900"
      >
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      {/* Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="rounded p-1 hover:bg-red-500/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice("")}
            className="rounded p-1 hover:bg-emerald-500/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Client header */}
      <header className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-900/10 text-lg font-semibold text-brand-900">
              {initials}
            </div>

            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                <User className="size-3.5" />
                Ficha de cliente
              </div>

              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {client.nombre_completo}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" />
                  {client.email}
                </span>

                {client.whatsapp_numero && (
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" />
                    {client.whatsapp_numero}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start">
            {client.chat_href && <Link
              href={client.chat_href}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-900 px-3 text-sm font-medium !text-white transition hover:opacity-90"
            >
              <MessageCircle className="size-4" />
              Chat
            </Link>}

            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${client.estado_relacion === "ACTIVO" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
              <ShieldCheck className="size-3.5" />
              {client.estado_relacion === "ACTIVO" ? "Con procesos activos" : "Sin procesos asociados"}
            </span>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-foreground-muted transition hover:bg-surface-secondary hover:text-foreground disabled:opacity-50"
              title="Actualizar"
            >
              <RefreshCw
                className={`size-4 ${
                  loading ? "animate-spin" : ""
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<BriefcaseBusiness className="size-5" />}
          label="Procesos"
          value={client.procesos.length}
        />

        <SummaryCard
          icon={<Clock3 className="size-5" />}
          label="Tareas pendientes"
          value={pendingTasks}
        />

        <SummaryCard
          icon={<FileText className="size-5" />}
          label="Documentos pendientes"
          value={pendingDocuments}
        />

        <SummaryCard
          icon={<Check className="size-5" />}
          label="Solicitudes"
          value={client.solicitudes_documento.length}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main */}
        <div className="space-y-5">
          {/* Processes */}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <SectionHeader
              icon={<BriefcaseBusiness className="size-5" />}
              title="Procesos"
              count={client.procesos.length}
            />

            {client.procesos.length === 0 ? (
              <EmptySection
                icon={<BriefcaseBusiness className="size-5" />}
                title="Sin procesos asociados"
                description="Este cliente todavía no está asociado a ningún proceso."
              />
            ) : (
              <div className="divide-y divide-border">
                {client.procesos.map((process) => (
                  <div
                    key={process.id}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-secondary"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-900/10 text-brand-900">
                        <BriefcaseBusiness className="size-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {process.nombre}
                        </p>

                        <p className="text-xs text-foreground-muted">
                          Proceso #{process.id}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/gestion-procesos/abogado/procesos/${process.id}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-900 hover:underline"
                    >
                      Abrir
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Tasks */}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <SectionHeader
              icon={<Clock3 className="size-5" />}
              title="Tareas"
              count={client.tareas.length}
            />

            {client.tareas.length === 0 ? (
              <EmptySection
                icon={<Clock3 className="size-5" />}
                title="Sin tareas"
                description="No hay tareas registradas para este cliente."
              />
            ) : (
              <div className="divide-y divide-border">
                {client.tareas.map((task) => {
                  const completed =
                    task.estado.toLowerCase() === "completada" ||
                    task.estado.toLowerCase() === "completado";

                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                            completed
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {completed ? (
                            <Check className="size-4" />
                          ) : (
                            <Clock3 className="size-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {task.titulo}
                          </p>

                          {task.fecha_limite && (
                            <p className="mt-0.5 text-xs text-foreground-muted">
                              Fecha límite:{" "}
                              {formatDate(task.fecha_limite)}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                          completed
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {task.estado}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Document requests */}
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <SectionHeader
              icon={<FileText className="size-5" />}
              title="Solicitudes de documentos"
              count={client.solicitudes_documento.length}
            />

            {client.solicitudes_documento.length === 0 ? (
              <EmptySection
                icon={<FileText className="size-5" />}
                title="Sin solicitudes"
                description="No hay solicitudes de documentos para este cliente."
              />
            ) : (
              <div className="divide-y divide-border">
                {client.solicitudes_documento.map((document) => {
                  const delivered = Boolean(document.atendida_en);

                  return (
                    <div
                      key={document.id}
                      className="flex items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-foreground-muted">
                          <FileText className="size-4" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {document.titulo}
                          </p>

                          <p className="mt-0.5 truncate text-xs text-foreground-muted">
                            {document.proceso}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                          delivered
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {delivered ? "Entregado" : "Pendiente"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <SectionHeader icon={<Clock3 className="size-5" />} title="Actividad reciente" count={client.actividad.length} />
            {client.actividad.length === 0 ? (
              <EmptySection icon={<Clock3 className="size-5" />} title="Sin actividad registrada" description="Los cambios y comunicaciones asociados al cliente aparecerán aquí." />
            ) : (
              <div className="divide-y divide-border">
                {client.actividad.map((item, index) => (
                  <div key={`${item.tipo}-${item.proceso_id}-${item.fecha}-${index}`} className="flex gap-3 px-5 py-4">
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-900" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{item.titulo}</p>
                        <span className="text-xs text-foreground-muted">{item.fecha ? formatDate(item.fecha) : "Fecha no disponible"}</span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--foreground-secondary)]">{item.descripcion}</p>
                      <p className="mt-1 text-xs text-foreground-muted">{item.proceso || "Cliente"}{item.actor ? ` · ${item.actor}` : ""} · {item.visibilidad === "CLIENTE" ? "Visible al cliente" : "Uso interno"}</p>
                    </div>
                    {item.proceso_id && <Link href={`/gestion-procesos/abogado/procesos/${item.proceso_id}/actividad`} className="shrink-0 text-xs font-medium text-brand-900 hover:underline">Abrir proceso</Link>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            <SectionHeader icon={<MessageCircle className="size-5" />} title="Comunicaciones" count={client.comunicaciones.length} />
            <div className="border-b px-5 py-3 text-xs text-foreground-muted" style={{ borderColor: "var(--border)" }}>
              Último contacto registrado: {client.ultimo_contacto ? formatDate(client.ultimo_contacto) : "Sin contactos registrados"}
            </div>
            {client.comunicaciones.length === 0 ? (
              <EmptySection icon={<MessageCircle className="size-5" />} title="Sin comunicaciones" description="Las notas y comunicaciones del expediente aparecerán aquí." />
            ) : (
              <div className="divide-y divide-border">
                {client.comunicaciones.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0"><p className="text-sm font-medium text-foreground">{item.asunto}</p><p className="mt-1 whitespace-pre-wrap text-sm text-[var(--foreground-secondary)]">{item.contenido}</p><p className="mt-1 text-xs text-foreground-muted">{item.proceso} · {item.actor} · {item.visibilidad === "CLIENTE" ? "Visible al cliente" : "Interna"} · {item.canal}</p></div>
                    <span className="text-xs text-foreground-muted">{formatDate(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          {/* Edit */}
          <form
            onSubmit={save}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface"
          >
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold text-foreground">
                Información del cliente
              </h2>

              <p className="mt-1 text-xs text-foreground-muted">
                Actualiza los datos de contacto.
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Nombre completo
                </span>

                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none transition focus:border-brand-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Correo electrónico
                </span>

                <input
                  value={client.email}
                  disabled
                  className="mt-1.5 h-10 w-full cursor-not-allowed rounded-lg border border-border bg-surface-secondary px-3 text-sm text-foreground-muted"
                />

                <p className="mt-1.5 text-xs text-foreground-muted">
                  El correo no puede modificarse mediante el endpoint
                  actual.
                </p>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  WhatsApp
                </span>

                <input
                  value={whatsapp}
                  onChange={(event) =>
                    setWhatsapp(event.target.value)
                  }
                  type="tel"
                  placeholder="Opcional"
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none transition focus:border-brand-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Género
                </span>
                <select
                  value={gender}
                  onChange={(event) => setGender(event.target.value as typeof gender)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none focus:border-brand-900"
                >
                  <option value="">Sin especificar</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="MASCULINO">Masculino</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Número de documento
                </span>
                <input
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  placeholder="Sin puntos"
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none focus:border-brand-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Domicilio
                </span>
                <input
                  value={domicile}
                  onChange={(event) => setDomicile(event.target.value)}
                  placeholder="Ciudad o municipio"
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none focus:border-brand-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground">
                  Dirección
                </span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none focus:border-brand-900"
                />
              </label>
            </div>

            <div className="border-t border-border px-5 py-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}

                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>

          {/* Notifications */}
          <section className="rounded-[var(--radius-lg)] border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold text-foreground">
                Notificaciones
              </h2>

              <p className="mt-1 text-xs text-foreground-muted">
                Preferencias actuales del cliente.
              </p>
            </div>

            <div className="p-5">
              <p className="text-sm text-foreground-muted">
                Canales elegidos por el cliente
              </p>
              <p className="mt-2 font-medium text-foreground">
                {[client.notificaciones_email && `Correo · ${client.email}`, client.notificaciones_whatsapp && `WhatsApp · ${client.whatsapp_numero || "sin número configurado"}`].filter(Boolean).join(" y ") || "Sin canal configurado"}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground-muted">
            {label}
          </p>

          <p className="mt-1 text-2xl font-semibold text-foreground">
            {value}
          </p>
        </div>

        <div className="flex size-10 items-center justify-center rounded-lg bg-brand-900/10 text-brand-900">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className="text-brand-900">{icon}</div>

        <h2 className="font-semibold text-foreground">
          {title}
        </h2>
      </div>

      <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-foreground-muted">
        {count}
      </span>
    </header>
  );
}

function EmptySection({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-secondary text-foreground-muted">
        {icon}
      </div>

      <p className="mt-3 text-sm font-medium text-foreground">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-sm text-xs text-foreground-muted">
        {description}
      </p>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(date);
}
