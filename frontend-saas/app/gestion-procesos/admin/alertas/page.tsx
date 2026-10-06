"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, RefreshCw, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { FilterBar } from "@/components/ui/FilterBar";

type AlertState = "ACTIVA" | "ATENDIDA" | "DESCARTADA";
type AlertItem = {
  id: string;
  tipo: string;
  prioridad: "Alta" | "Media" | "Baja";
  fecha: string | null;
  descripcion: string;
  recurso: string;
  href: string;
  accion_recomendada: string;
  estado: AlertState;
  descartable: boolean;
};
type Filter = "Todas" | "Activas" | "Pendientes" | "Advertencias" | "Errores" | "Riesgos" | "Eventos" | "Atendidas";

const filters: Filter[] = ["Todas", "Activas", "Pendientes", "Advertencias", "Errores", "Riesgos", "Eventos", "Atendidas"];
const priorityTone = { Alta: "risk", Media: "attention", Baja: "normal" } as const;

export default function AdminAlertsPage() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [filter, setFilter] = useState<Filter>("Activas");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const token = typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setItems(await fetchApi("/api/admin/alertas", { method: "GET", token }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar las alertas.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetchApi("/api/admin/alertas", { method: "GET", token })
      .then((result) => { if (active) setItems(result); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No fue posible cargar las alertas.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function updateState(alert: AlertItem, estado: "ATENDIDA" | "DESCARTADA") {
    setBusyId(alert.id);
    setError("");
    try {
      await fetchApi(`/api/admin/alertas/${encodeURIComponent(alert.id)}/estado`, {
        method: "PATCH", token, body: JSON.stringify({ estado }),
      });
      setItems((current) => current.map((item) => item.id === alert.id ? { ...item, estado } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible actualizar la alerta.");
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "Activas") return item.estado === "ACTIVA";
    if (filter === "Atendidas") return item.estado !== "ACTIVA";
    if (filter === "Pendientes") return item.tipo === "Pendiente";
    if (filter === "Advertencias") return item.tipo === "Advertencia";
    if (filter === "Errores") return item.tipo === "Error";
    if (filter === "Riesgos") return item.tipo === "Riesgo";
    if (filter === "Eventos") return item.tipo === "Evento";
    return true;
  }), [filter, items]);
  const activeCount = items.filter((item) => item.estado === "ACTIVA").length;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-foreground-muted">Centro de atención</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Bell className="size-6" /> Alertas</h1>
          <p className="mt-2 text-sm text-foreground-muted">Pendientes, riesgos y eventos importantes de la operación.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 size-4" /> Actualizar
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-sm text-foreground-muted">Alertas activas</p><p className="mt-1 text-2xl font-semibold">{activeCount}</p></Card>
        <Card className="p-4"><p className="text-sm text-foreground-muted">Errores y riesgos</p><p className="mt-1 text-2xl font-semibold">{items.filter((item) => item.estado === "ACTIVA" && ["Error", "Riesgo"].includes(item.tipo)).length}</p></Card>
        <Card className="p-4"><p className="text-sm text-foreground-muted">Pendientes y eventos</p><p className="mt-1 text-2xl font-semibold">{items.filter((item) => item.estado === "ACTIVA" && ["Pendiente", "Evento"].includes(item.tipo)).length}</p></Card>
      </div>

      <FilterBar>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar alertas">
          {filters.map((option) => <Button key={option} size="sm" variant={filter === option ? "primary" : "secondary"} onClick={() => setFilter(option)}>{option}</Button>)}
        </div>
      </FilterBar>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</div>}
      {loading ? <LoadingState label="Cargando alertas" rows={5} /> : visible.length === 0 ? (
        <EmptyState title={filter === "Activas" ? "Todo está al día" : "No hay alertas en esta vista"} description="Las alertas aparecen cuando hay pendientes o eventos reales que requieren atención." />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <Card key={item.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={priorityTone[item.prioridad]}>{item.prioridad}</Badge>
                  <Badge tone={item.estado === "ACTIVA" ? "pending" : item.estado === "ATENDIDA" ? "completed" : "archived"}>{item.estado === "ACTIVA" ? item.tipo : item.estado === "ATENDIDA" ? "Atendida" : "Descartada"}</Badge>
                  {item.fecha && <time className="text-xs text-foreground-muted" dateTime={item.fecha}>{new Date(item.fecha).toLocaleString("es-CO")}</time>}
                </div>
                <h2 className="mt-2 font-semibold">{item.descripcion}</h2>
                <p className="mt-1 text-sm text-foreground-muted">{item.recurso} · Acción recomendada: {item.accion_recomendada}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-surface-hover px-3 text-xs font-semibold text-foreground hover:brightness-95" href={item.href}><ExternalLink className="size-4" /> Abrir recurso</Link>
                {item.estado === "ACTIVA" && <Button size="sm" onClick={() => void updateState(item, "ATENDIDA")} disabled={busyId === item.id}><Check className="mr-1 size-4" /> Marcar atendida</Button>}
                {item.estado === "ACTIVA" && item.descartable && <Button size="sm" variant="ghost" onClick={() => void updateState(item, "DESCARTADA")} disabled={busyId === item.id}><X className="mr-1 size-4" /> Descartar</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
