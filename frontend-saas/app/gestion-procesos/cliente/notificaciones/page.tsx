"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Notice = {
  id: string;
  tipo: string;
  categoria: string;
  titulo: string;
  descripcion: string;
  fecha?: string | null;
  proceso: string;
  href: string;
  leida: boolean;
};

export default function NotificacionesClientePage() {
  const { token, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setItems(await fetchApi("/api/expedientes/cliente/notificaciones", { token }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar las notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || sessionLoading) return;
    let active = true;
    fetchApi("/api/expedientes/cliente/notificaciones", { token })
      .then((data: Notice[]) => {
        if (active) setItems(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las notificaciones.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, sessionLoading]);

  async function mark(ids: string[]) {
    if (!token || !ids.length) return;
    try {
      await fetchApi("/api/expedientes/cliente/notificaciones/leer", {
        method: "POST",
        token,
        body: JSON.stringify({ ids }),
      });
      setItems((current) => current.map((item) => (ids.includes(item.id) ? { ...item, leida: true } : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar las notificaciones.");
    }
  }

  async function markAll() {
    if (!token) return;
    try {
      await fetchApi("/api/expedientes/cliente/notificaciones/leer-todas", { method: "POST", token });
      setItems((current) => current.map((item) => ({ ...item, leida: true })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar las notificaciones.");
    }
  }

  const unread = useMemo(() => items.filter((item) => !item.leida).length, [items]);
  const visible = useMemo(() => (unreadOnly ? items.filter((item) => !item.leida) : items), [items, unreadOnly]);

  return (
    <section className="mx-auto max-w-4xl space-y-6 pb-24">
      <PageHeader
        overline="Portal del cliente"
        title="Notificaciones"
        description={unread > 0 ? `Tienes ${unread} notificación(es) sin leer.` : "Todas tus notificaciones están al día."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAll()}
              disabled={!unread || loading}
              icon={<CheckCheck className="size-4" />}
            >
              Marcar todas como leídas
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                void load();
              }}
              loading={loading}
              icon={<RefreshCw className="size-4" />}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="rounded-lg border border-risk/30 bg-risk/10 p-3.5 text-sm font-medium text-risk">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-xs">
        <div>
          <p className="text-sm font-semibold text-foreground">Filtrar vista</p>
          <p className="text-xs text-muted">
            {unreadOnly ? `${visible.length} aviso(s) sin leer` : `${visible.length} aviso(s) en total`}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-surface-secondary p-1 shadow-2xs">
          <button
            type="button"
            aria-pressed={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              !unreadOnly ? "bg-brand-900 text-white shadow-xs" : "text-muted hover:text-foreground"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly(true)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              unreadOnly ? "bg-brand-900 text-white shadow-xs" : "text-muted hover:text-foreground"
            }`}
          >
            Solo sin leer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted">
          <RefreshCw className="mr-2 inline size-4 animate-spin text-brand-700" />
          Cargando notificaciones...
        </div>
      ) : visible.length > 0 ? (
        <ul
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
          aria-label={unreadOnly ? "Notificaciones sin leer" : "Todas las notificaciones"}
        >
          {visible.map((item) => (
            <li
              key={item.id}
              className={`flex gap-3.5 p-4.5 transition-colors ${
                item.leida ? "hover:bg-surface-hover/60" : "bg-brand-50/50 hover:bg-brand-50/80 dark:bg-brand-950/30"
              }`}
            >
              <div
                className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${
                  item.leida
                    ? "bg-surface-secondary text-muted"
                    : "bg-brand-100 text-brand-900 dark:bg-brand-900 dark:text-brand-100"
                }`}
              >
                <Bell className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
                    {item.tipo} · {item.proceso}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.leida ? "normal" : "attention"}>
                      {item.leida ? "Leída" : "Sin leer"}
                    </Badge>
                    <time className="text-xs text-muted">
                      {item.fecha
                        ? new Intl.DateTimeFormat("es-CO", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "America/Bogota",
                          }).format(new Date(item.fecha))
                        : ""}
                    </time>
                  </div>
                </div>

                <h2 className="mt-1 text-sm font-semibold text-foreground">{item.titulo}</h2>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted leading-relaxed">
                  {item.descripcion}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={item.href}>
                    <Button variant="outline" size="sm">
                      Abrir
                    </Button>
                  </Link>
                  {!item.leida && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void mark([item.id])}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Marcar como leída
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center text-sm text-muted">
          {unreadOnly ? "Ya leíste todas tus notificaciones." : "No tienes notificaciones todavía."}
        </div>
      )}
    </section>
  );
}
