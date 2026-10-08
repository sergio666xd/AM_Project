"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { fetchApi } from "@/lib/api";

type Plan = {
  id: number;
  nombre: string;
  limite_radicados: number;
  precio_mensual: number;
  activo: boolean;
  limite_ultimas_actuaciones: number | null;
  notificaciones_whatsapp_procesos: boolean;
  notificaciones_whatsapp_tareas: boolean;
};
type FormState = {
  nombre: string;
  limite_radicados: string;
  precio_mensual: string;
  limite_ultimas_actuaciones: string;
  notificaciones_whatsapp_procesos: boolean;
  notificaciones_whatsapp_tareas: boolean;
};
const emptyForm: FormState = {
  nombre: "",
  limite_radicados: "10",
  precio_mensual: "0",
  limite_ultimas_actuaciones: "5",
  notificaciones_whatsapp_procesos: false,
  notificaciones_whatsapp_tareas: false,
};

async function loadPlans(token: string): Promise<Plan[]> {
  return fetchApi("/api/admin/planes", { method: "GET", token });
}

function moneda(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadPlans(token)
      .then((items) => {
        if (active) setPlans(items);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar los planes.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function reload() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      setPlans(await loadPlans(token));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar los planes.",
      );
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(
    () =>
      plans.filter((plan) => {
        const matchesQuery =
          !query ||
          plan.nombre.toLowerCase().includes(query.trim().toLowerCase());
        const matchesState =
          filter === "TODOS" ||
          (filter === "ACTIVOS" ? plan.activo : !plan.activo);
        return matchesQuery && matchesState;
      }),
    [plans, query, filter],
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
    setError("");
  }
  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm({
      nombre: plan.nombre,
      limite_radicados: String(plan.limite_radicados),
      precio_mensual: String(plan.precio_mensual),
      limite_ultimas_actuaciones:
        plan.limite_ultimas_actuaciones == null
          ? "TODAS"
          : String(plan.limite_ultimas_actuaciones),
      notificaciones_whatsapp_procesos: plan.notificaciones_whatsapp_procesos,
      notificaciones_whatsapp_tareas: plan.notificaciones_whatsapp_tareas,
    });
    setFormOpen(true);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    const payload = {
      nombre: form.nombre.trim(),
      limite_radicados: Number(form.limite_radicados),
      precio_mensual: Number(form.precio_mensual),
      limite_ultimas_actuaciones:
        form.limite_ultimas_actuaciones === "TODAS"
          ? null
          : Number(form.limite_ultimas_actuaciones),
      notificaciones_whatsapp_procesos: form.notificaciones_whatsapp_procesos,
      notificaciones_whatsapp_tareas: form.notificaciones_whatsapp_tareas,
    };
    try {
      await fetchApi(
        editing ? `/api/admin/planes/${editing.id}` : "/api/admin/planes",
        {
          method: editing ? "PUT" : "POST",
          token,
          body: JSON.stringify(payload),
        },
      );
      setFormOpen(false);
      setEditing(null);
      setNotice("Plan guardado.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar el plan.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus(plan: Plan) {
    if (!token) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(
        `/api/admin/planes/${plan.id}/estado?activo=${!plan.activo}`,
        { method: "PATCH", token },
      );
      setNotice(
        result.mensaje ||
          (plan.activo ? "Plan desactivado." : "Plan activado."),
      );
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cambiar el estado.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function remove(plan: Plan) {
    if (
      !token ||
      !window.confirm(
        `¿Eliminar el plan ${plan.nombre}? Solo se permite si no tiene usuarios asignados.`,
      )
    )
      return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/admin/planes/${plan.id}`, {
        method: "DELETE",
        token,
      });
      setNotice(result.mensaje || "Plan eliminado.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible eliminar el plan.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function setSelectedStatus(active: boolean) {
    const selected = visible.filter((plan) => selectedIds.includes(plan.id) && plan.activo !== active);
    if (!selected.length || !window.confirm(`¿${active ? "Activar" : "Desactivar"} ${selected.length} planes seleccionados?`)) return;
    setWorking(true); setError(""); setNotice("");
    const outcomes = await Promise.allSettled(selected.map((plan) => fetchApi(`/api/admin/planes/${plan.id}/estado?activo=${active}`, { method: "PATCH", token })));
    const failed = outcomes.filter((result) => result.status === "rejected").length;
    setNotice(`${outcomes.length - failed} planes actualizados${failed ? `; ${failed} con error` : ""}.`);
    if (failed) setError(outcomes.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : "Error al actualizar un plan.").join(" "));
    setSelectedIds([]); setWorking(false); await reload();
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel Administrativo · SaaS individual
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Planes
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Límites y funciones de las cuentas de abogados externos.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Actualizar planes"
            className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Nuevo plan
          </button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-[1fr_200px]">
        <label className="relative">
          <span className="sr-only">Buscar planes</span>
          <Search className="absolute left-3 top-2.5 size-4 text-foreground-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar plan"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Filtrar estado"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="TODOS">Todos los estados</option>
          <option value="ACTIVOS">Activos</option>
          <option value="INACTIVOS">Inactivos</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && visible.every((plan) => selectedIds.includes(plan.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visible.map((plan) => plan.id)])] : current.filter((id) => !visible.some((plan) => plan.id === id)))} />Seleccionar planes visibles</label><span className="text-sm text-foreground-muted">{selectedIds.length} seleccionados</span><div className="ml-auto flex gap-2"><button type="button" onClick={() => void setSelectedStatus(true)} disabled={working || !selectedIds.length} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">Activar selección</button><button type="button" onClick={() => void setSelectedStatus(false)} disabled={working || !selectedIds.length} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">Desactivar selección</button></div></div>
        <table className="w-full min-w-212.5 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3"><span className="sr-only">Selección</span></th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Radicados</th>
              <th className="px-4 py-3">Actuaciones</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando planes...
                </td>
              </tr>
            ) : visible.length ? (
              visible.map((plan) => (
                <tr
                  key={plan.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(plan.id)} onChange={() => setSelectedIds((current) => current.includes(plan.id) ? current.filter((id) => id !== plan.id) : [...current, plan.id])} aria-label={`Seleccionar plan ${plan.nombre}`} /></td>
                  <td className="px-4 py-3 font-semibold"><button type="button" onClick={() => openEdit(plan)} className="text-left hover:text-primary hover:underline">{plan.nombre}</button></td>
                  <td className="px-4 py-3">{moneda(plan.precio_mensual)}</td>
                  <td className="px-4 py-3">{plan.limite_radicados}</td>
                  <td className="px-4 py-3">
                    {plan.limite_ultimas_actuaciones ?? "Todas"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    Procesos{" "}
                    {plan.notificaciones_whatsapp_procesos ? "· Tareas" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs ${plan.activo ? "bg-success-light text-success" : "bg-surface-secondary text-foreground-muted"}`}
                    >
                      {plan.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(plan)}
                        aria-label={`Editar plan ${plan.nombre}`}
                        className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void changeStatus(plan)}
                        className="rounded-md border border-border px-2.5 text-xs hover:bg-surface-hover"
                      >
                        {plan.activo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void remove(plan)}
                        aria-label={`Eliminar plan ${plan.nombre}`}
                        className="grid size-9 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-light"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-sm text-foreground-muted"
                >
                  No hay planes en este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Editar plan" : "Crear plan"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl"
          >
            <header className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">
                  SaaS individual
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {editing ? "Editar plan" : "Nuevo plan"}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setFormOpen(false)}
                className="grid size-9 place-items-center rounded-md hover:bg-surface-hover"
              >
                <X className="size-4" />
              </button>
            </header>
            <label className="block text-sm font-medium">
              Nombre
              <input
                required
                maxLength={80}
                value={form.nombre}
                onChange={(event) =>
                  setForm({ ...form, nombre: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Límite de radicados
                <input
                  type="number"
                  min="1"
                  required
                  value={form.limite_radicados}
                  onChange={(event) =>
                    setForm({ ...form, limite_radicados: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                />
              </label>
              <label className="text-sm font-medium">
                Precio mensual
                <input
                  type="number"
                  min="0"
                  required
                  value={form.precio_mensual}
                  onChange={(event) =>
                    setForm({ ...form, precio_mensual: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Actuaciones visibles
              <select
                value={form.limite_ultimas_actuaciones}
                onChange={(event) =>
                  setForm({
                    ...form,
                    limite_ultimas_actuaciones: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
              >
                <option value="5">Últimas 5</option>
                <option value="3">Últimas 3</option>
                <option value="TODAS">Todas</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notificaciones_whatsapp_procesos}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notificaciones_whatsapp_procesos: event.target.checked,
                  })
                }
              />
              WhatsApp para novedades de procesos
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.notificaciones_whatsapp_tareas}
                onChange={(event) =>
                  setForm({
                    ...form,
                    notificaciones_whatsapp_tareas: event.target.checked,
                  })
                }
              />
              WhatsApp para recordatorios de tareas
            </label>
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={working}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {working ? "Guardando..." : "Guardar plan"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
