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
  canal_notificacion_cliente?: "EMAIL" | "WHATSAPP" | null;
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
};

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>();

  const [client, setClient] = useState<Client | null>(null);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

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
    void load();
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
        <div className="h-5 w-24 animate-pulse rounded bg-[var(--surface-secondary)]" />

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center gap-4">
            <div className="size-16 animate-pulse rounded-full bg-[var(--surface-secondary)]" />

            <div className="space-y-2">
              <div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-secondary)]" />
              <div className="h-3 w-64 animate-pulse rounded bg-[var(--surface-secondary)]" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]"
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
          className="inline-flex items-center gap-2 text-sm text-[var(--primary)]"
        >
          <ArrowLeft className="size-4" />
          Volver a clientes
        </Link>

        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/10 p-6">
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
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--foreground-muted)] transition hover:text-[var(--primary)]"
      >
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      {/* Alerts */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
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
          className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
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
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-lg font-semibold text-[var(--primary)]">
              {initials}
            </div>

            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                <User className="size-3.5" />
                Ficha de cliente
              </div>

              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
                {client.nombre_completo}
              </h1>

              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--foreground-muted)]">
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
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="size-3.5" />
              Acceso activo
            </span>

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)] disabled:opacity-50"
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
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
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
              <div className="divide-y divide-[var(--border)]">
                {client.procesos.map((process) => (
                  <div
                    key={process.id}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[var(--surface-secondary)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                        <BriefcaseBusiness className="size-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--foreground)]">
                          {process.nombre}
                        </p>

                        <p className="text-xs text-[var(--foreground-muted)]">
                          Proceso #{process.id}
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/gestion-procesos/abogado/procesos/${process.id}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--primary)] hover:underline"
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
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
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
              <div className="divide-y divide-[var(--border)]">
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
                          <p className="truncate text-sm font-medium text-[var(--foreground)]">
                            {task.titulo}
                          </p>

                          {task.fecha_limite && (
                            <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
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
          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
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
              <div className="divide-y divide-[var(--border)]">
                {client.solicitudes_documento.map((document) => {
                  const delivered = Boolean(document.atendida_en);

                  return (
                    <div
                      key={document.id}
                      className="flex items-center justify-between gap-4 px-5 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
                          <FileText className="size-4" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--foreground)]">
                            {document.titulo}
                          </p>

                          <p className="mt-0.5 truncate text-xs text-[var(--foreground-muted)]">
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
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          {/* Edit */}
          <form
            onSubmit={save}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
          >
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-semibold text-[var(--foreground)]">
                Información del cliente
              </h2>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Actualiza los datos de contacto.
              </p>
            </div>

            <div className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Nombre completo
                </span>

                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  Correo electrónico
                </span>

                <input
                  value={client.email}
                  disabled
                  className="mt-1.5 h-10 w-full cursor-not-allowed rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-3 text-sm text-[var(--foreground-muted)]"
                />

                <p className="mt-1.5 text-xs text-[var(--foreground-muted)]">
                  El correo no puede modificarse mediante el endpoint
                  actual.
                </p>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  WhatsApp
                </span>

                <input
                  value={whatsapp}
                  onChange={(event) =>
                    setWhatsapp(event.target.value)
                  }
                  type="tel"
                  placeholder="Opcional"
                  className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)]"
                />
              </label>
            </div>

            <div className="border-t border-[var(--border)] px-5 py-4">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="font-semibold text-[var(--foreground)]">
                Notificaciones
              </h2>

              <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                Preferencias actuales del cliente.
              </p>
            </div>

            <div className="p-5">
              <p className="text-sm text-[var(--foreground-muted)]">
                Canal obligatorio elegido por el cliente
              </p>
              <p className="mt-2 font-medium text-[var(--foreground)]">
                {client.canal_notificacion_cliente === "WHATSAPP"
                  ? `WhatsApp · ${client.whatsapp_numero || "sin número configurado"}`
                  : client.canal_notificacion_cliente === "EMAIL"
                    ? `Correo · ${client.email}`
                    : "Sin canal configurado"}
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
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--foreground-muted)]">
            {label}
          </p>

          <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
            {value}
          </p>
        </div>

        <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
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
    <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className="text-[var(--primary)]">{icon}</div>

        <h2 className="font-semibold text-[var(--foreground)]">
          {title}
        </h2>
      </div>

      <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--foreground-muted)]">
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
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
        {icon}
      </div>

      <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--foreground-muted)]">
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
  }).format(date);
}