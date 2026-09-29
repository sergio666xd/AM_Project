"use client";

import { apiRequest } from "@/lib/api";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";


type Notice = {
  id: number;
  proceso: string;
  cliente: string;
  asunto: string;
  cuerpo?: string;
  comentarios?: string;
  created_at: string;
};

export default function NotificacionesPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await apiRequest(
        `/api/expedientes/notificaciones`,
        {
          headers: {
            Authorization: `Bearer ${
              localStorage.getItem("token") || ""
            }`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible cargar las notificaciones."
        );
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar las notificaciones."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) return items;

    return items.filter((item) =>
      [
        item.asunto,
        item.proceso,
        item.cliente,
        item.cuerpo || "",
        item.comentarios || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [items, query]);

  const pendingToday = useMemo(() => {
    const today = new Date();

    return items.filter((item) => {
      const date = new Date(item.created_at);

      return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      );
    }).length;
  }, [items]);

  const latestNotification = items[0];

  return (
    <section className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--foreground-muted)]">
            Despacho
          </p>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
            Notificaciones
          </h1>

          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Historial de avisos de actuaciones enviados a clientes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin" : ""}`}
          />
          Actualizar
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Avisos enviados
              </p>

              <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                {items.length}
              </p>
            </div>

            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Bell className="size-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Avisos de hoy
              </p>

              <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                {pendingToday}
              </p>
            </div>

            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--info)]/10 text-[var(--info)]">
              <Clock3 className="size-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-[var(--foreground-muted)]">
                Último aviso
              </p>

              <p className="mt-2 truncate text-sm font-semibold text-[var(--foreground)]">
                {latestNotification?.asunto || "Sin notificaciones"}
              </p>

              {latestNotification && (
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {new Date(
                    latestNotification.created_at
                  ).toLocaleString("es-CO")}
                </p>
              )}
            </div>

            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--success)]/10 text-[var(--success)]">
              <CheckCircle2 className="size-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar notificaciones..."
            className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/10"
          />
        </div>

        <p className="text-sm text-[var(--foreground-muted)]">
          {filteredItems.length}{" "}
          {filteredItems.length === 1
            ? "notificación"
            : "notificaciones"}
        </p>
      </div>

      {/* Historial */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Historial de notificaciones
            </h2>

            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              Avisos generados a partir de las actuaciones de los procesos.
            </p>
          </div>

          <div className="hidden size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] sm:flex">
            <Bell className="size-4" />
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-[var(--border)]">
            {[1, 2, 3].map((item) => (
              <div key={item} className="animate-pulse px-5 py-5">
                <div className="flex gap-4">
                  <div className="size-9 rounded-lg bg-[var(--surface-secondary)]" />

                  <div className="flex-1 space-y-3">
                    <div className="h-4 w-48 rounded bg-[var(--surface-secondary)]" />
                    <div className="h-3 w-64 rounded bg-[var(--surface-secondary)]" />
                    <div className="h-3 w-full max-w-xl rounded bg-[var(--surface-secondary)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
              <Bell className="size-5" />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-[var(--foreground)]">
              {query
                ? "No encontramos notificaciones"
                : "Aún no hay notificaciones"}
            </h3>

            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
              {query
                ? "Prueba con otro término de búsqueda."
                : "Cuando envíes avisos de actuaciones a tus clientes, aparecerán aquí."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                className="px-5 py-5 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="flex gap-4">
                  {/* Icono */}
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                    <Bell className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Línea principal */}
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--foreground)]">
                          {item.asunto}
                        </h3>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                            <FileText className="size-3.5" />
                            {item.proceso}
                          </span>

                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
                            <UserRound className="size-3.5" />
                            {item.cliente}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success)]/10 px-2.5 py-1 text-xs font-medium text-[var(--success)]">
                          <CheckCircle2 className="size-3" />
                          Enviado
                        </span>

                        <span className="text-xs text-[var(--foreground-muted)]">
                          {new Date(
                            item.created_at
                          ).toLocaleString("es-CO")}
                        </span>
                      </div>
                    </div>

                    {/* Cuerpo */}
                    {item.cuerpo && (
                      <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
                          {item.cuerpo}
                        </p>
                      </div>
                    )}

                    {/* Comentarios */}
                    {item.comentarios && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-[var(--foreground-muted)]">
                          Comentarios
                        </p>

                        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                          {item.comentarios}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}