"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { fetchApi } from "@/lib/api";

type AuditEvent = {
  id: number;
  actor_id?: number | null;
  accion: string;
  tipo_recurso: string;
  recurso_id?: string | null;
  created_at: string;
};
async function loadEvents(token: string): Promise<AuditEvent[]> {
  return fetchApi("/api/admin/auditoria?limit=200&offset=0", {
    method: "GET",
    token,
  });
}

export default function AdminAuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadEvents(token)
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar la auditoría.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setEvents(await loadEvents(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar la auditoría.",
      );
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter(
      (event) =>
        !term ||
        `${event.accion} ${event.tipo_recurso} ${event.recurso_id ?? ""} ${event.actor_id ?? ""}`
          .toLowerCase()
          .includes(term),
    );
  }, [events, query]);

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel Administrativo · Global
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Auditoría
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Eventos administrativos y operativos registrados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Actualizar auditoría"
          className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <label className="relative block rounded-lg border border-border bg-surface p-3">
        <span className="sr-only">Buscar eventos</span>
        <Search className="absolute left-6 top-5 size-4 text-foreground-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar acción, recurso o identificador"
          className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </label>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-180 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Acción</th>
              <th className="px-4 py-3">Recurso</th>
              <th className="px-4 py-3">ID recurso</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando eventos...
                </td>
              </tr>
            ) : filtered.length ? (
              filtered.map((event) => (
                <tr
                  key={event.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3 text-foreground-secondary">
                    {new Date(event.created_at).toLocaleString("es-CO")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {event.actor_id ?? "Sistema"}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {event.accion}
                  </td>
                  <td className="px-4 py-3 text-foreground-secondary">
                    {event.tipo_recurso}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground-muted">
                    {event.recurso_id || "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-foreground-muted"
                >
                  No hay eventos para esta búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        Mostrando hasta 200 eventos recientes.
      </p>
    </section>
  );
}
