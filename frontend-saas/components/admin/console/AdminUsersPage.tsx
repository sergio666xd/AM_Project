"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KeyRound, Mail, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { apiRequest, fetchApi } from "@/lib/api";
import { ApiErrorState } from "@/components/ui/ApiErrorState";

type Role = "ABOGADO_ADMIN" | "ABOGADO" | "CLIENTE" | "ADMIN";
type Status = "ACTIVO" | "SUSPENDIDO" | "PENDIENTE_APROBACION" | "RECHAZADO";
type Plan = { id: number; nombre: string; activo: boolean };
type User = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  rol: Role;
  estado: Status;
  plan?: { id: number; nombre: string } | null;
  creado_por_abogado_id?: number | null;
  debe_cambiar_password?: boolean;
};
type Scope = "FIRMA" | "CLIENTES" | "SAAS" | "ADMIN";
type FormState = {
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  password_temporal: string;
  rol: Role;
  plan_id: string;
  creado_por_abogado_id: string;
};
const initialForm: FormState = {
  nombre_completo: "",
  email: "",
  whatsapp_numero: "",
  password_temporal: "",
  rol: "ABOGADO_ADMIN",
  plan_id: "",
  creado_por_abogado_id: "",
};
const roleLabels: Record<Role, string> = {
  ABOGADO_ADMIN: "Abogado de la firma",
  ABOGADO: "Abogado SaaS · Plataforma",
  CLIENTE: "Cliente",
  ADMIN: "Administrador de plataforma",
};
const stateLabels: Record<Status, string> = {
  ACTIVO: "Activo",
  SUSPENDIDO: "Suspendido",
  PENDIENTE_APROBACION: "Pendiente",
  RECHAZADO: "Rechazado",
};

async function loadOptions(token: string) {
  const loadJson = async <T,>(endpoint: string, label: string): Promise<T> => {
    let response: Response;
    try {
      response = await apiRequest(endpoint, { method: "GET", token });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Error desconocido.";
      throw new Error(`${label}: ${detail}`);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(`${label}: el servidor devolvió una respuesta inválida.`);
    }
    return data as T;
  };

  const [users, plans] = await Promise.all([
    loadJson<unknown>("/api/admin/usuarios?incluir_administradores=true", "No fue posible cargar usuarios"),
    loadJson<unknown>("/api/admin/planes", "No fue posible cargar planes"),
  ]);
  if (!Array.isArray(users)) {
    throw new Error("No fue posible cargar usuarios: la API devolvió un formato inesperado.");
  }
  if (!Array.isArray(plans)) {
    throw new Error("No fue posible cargar planes: la API devolvió un formato inesperado.");
  }
  return { users: users as User[], plans: plans as Plan[] };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [scope, setScope] = useState<Scope>("FIRMA");
  const [role, setRole] = useState("TODOS");
  const [status, setStatus] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const token =
    typeof window === "undefined" ? "" : localStorage.getItem("token") || "";

  useEffect(() => {
    if (!token) return;
    let active = true;
    loadOptions(token)
      .then((result) => {
        if (active) {
          setUsers(result.users);
          setPlans(result.plans.filter((plan) => plan.activo));
          setLoadError("");
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error
              ? cause.message
              : "No fue posible cargar usuarios.",
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
    setLoadError("");
    try {
      const result = await loadOptions(token);
      setUsers(result.users);
      setPlans(result.plans.filter((plan) => plan.activo));
      setLoadError("");
    } catch (cause) {
      setLoadError(
        cause instanceof Error
          ? cause.message
          : "No fue posible cargar usuarios.",
      );
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(
    () =>
      users.filter((user) => {
        const inScope =
          (scope === "SAAS" && user.rol === "ABOGADO") ||
          (scope === "FIRMA" && user.rol === "ABOGADO_ADMIN") ||
          (scope === "CLIENTES" && user.rol === "CLIENTE") ||
          (scope === "ADMIN" && user.rol === "ADMIN");
        const matchesRole = role === "TODOS" || user.rol === role;
        const matchesStatus = status === "TODOS" || user.estado === status;
        const term = search.trim().toLowerCase();
        const matchesSearch =
          !term ||
          `${user.nombre_completo} ${user.email} ${user.whatsapp_numero}`
            .toLowerCase()
            .includes(term);
        return inScope && matchesRole && matchesStatus && matchesSearch;
      }),
    [users, scope, role, status, search],
  );

  function openCreate() {
    setEditing(null);
    const rol = scope === "SAAS" ? "ABOGADO" : scope === "CLIENTES" ? "CLIENTE" : "ABOGADO_ADMIN";
    setForm({ ...initialForm, rol, plan_id: plans[0] ? String(plans[0].id) : "" });
    setFormOpen(true);
    setError("");
  }
  function openEdit(user: User) {
    setEditing(user);
    setForm({
      ...initialForm,
      nombre_completo: user.nombre_completo,
      email: user.email,
      whatsapp_numero: user.whatsapp_numero,
      rol: user.rol,
      plan_id: user.plan ? String(user.plan.id) : "",
      creado_por_abogado_id: user.creado_por_abogado_id
        ? String(user.creado_por_abogado_id)
        : "",
    });
    setFormOpen(true);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const payload = editing
        ? {
            nombre_completo: form.nombre_completo.trim(),
            whatsapp_numero: form.whatsapp_numero.trim(),
            rol: form.rol,
            ...(form.rol === "ABOGADO" && form.plan_id
              ? { plan_id: Number(form.plan_id) }
              : {}),
            ...(form.rol === "CLIENTE" && form.creado_por_abogado_id
              ? { creado_por_abogado_id: Number(form.creado_por_abogado_id) }
              : {}),
          }
        : {
            ...form,
            nombre_completo: form.nombre_completo.trim(),
            email: form.email.trim().toLowerCase(),
            whatsapp_numero: form.whatsapp_numero.trim(),
            plan_id:
              form.rol === "ABOGADO" && form.plan_id
                ? Number(form.plan_id)
                : null,
            creado_por_abogado_id:
              form.rol === "CLIENTE" && form.creado_por_abogado_id
                ? Number(form.creado_por_abogado_id)
                : null,
          };
      const response = await fetchApi(
        editing ? `/api/admin/usuarios/${editing.id}` : "/api/admin/usuarios",
        {
          method: editing ? "PATCH" : "POST",
          token,
          body: JSON.stringify(payload),
        },
      );
      setNotice(
        editing
          ? "Usuario actualizado."
          : "Usuario creado; deberá cambiar la contraseña temporal.",
      );
      setFormOpen(false);
      setEditing(null);
      setForm(initialForm);
      await reload();
      return response;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible guardar el usuario.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus(user: User, next: Status) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/admin/usuarios/${user.id}/estado?estado=${next}`, {
        method: "PATCH",
        token,
      });
      setNotice(`${user.nombre_completo}: ${stateLabels[next].toLowerCase()}.`);
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

  async function deleteUser(user: User) {
    if (!window.confirm(`¿Eliminar de forma permanente la cuenta de ${user.nombre_completo}? Se eliminarán sus registros asociados; los documentos se conservarán en el inventario ADMIN sin los vínculos a esta cuenta.`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/admin/usuarios/${user.id}`, { method: "DELETE", token });
      setNotice(result.mensaje || "Cuenta eliminada.");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible eliminar la cuenta.");
    } finally {
      setWorking(false);
    }
  }

  async function forcePasswordChange(user: User) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(
        `/api/admin/usuarios/${user.id}/forzar-cambio-password`,
        { method: "PATCH", token },
      );
      setNotice(result.mensaje || "Cambio de contraseña requerido.");
      await reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No fue posible actualizar la seguridad.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function sendPasswordReset(user: User) {
    if (!window.confirm(`¿Enviar a ${user.email} un enlace para restablecer su contraseña?`)) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(`/api/admin/usuarios/${user.id}/enviar-restablecimiento`, { method: "POST", token });
      setNotice(result.mensaje || `Se solicitó el envío a ${user.email}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible enviar el restablecimiento.");
    } finally {
      setWorking(false);
    }
  }

  async function bulkUserAction(action: "ACTIVATE" | "SUSPEND" | "DELETE") {
    const selected = visible.filter((user) => selectedIds.includes(user.id) && user.rol !== "ADMIN");
    const eligible = selected.filter((user) => action === "ACTIVATE" ? user.estado === "SUSPENDIDO" || user.estado === "RECHAZADO" : action === "SUSPEND" ? user.estado === "ACTIVO" : true);
    if (!eligible.length) return;
    if (!window.confirm(action === "DELETE" ? `¿Eliminar permanentemente ${eligible.length} cuentas? Los documentos asociados se conservarán en el inventario ADMIN y se desligarán de las cuentas eliminadas.` : `¿${action === "ACTIVATE" ? "Activar" : "Suspender"} ${eligible.length} cuentas?`)) return;
    setWorking(true); setError(""); setNotice("");
    const outcomes = await Promise.allSettled(eligible.map((user) => fetchApi(
      action === "DELETE" ? `/api/admin/usuarios/${user.id}` : `/api/admin/usuarios/${user.id}/estado?estado=${action === "ACTIVATE" ? "ACTIVO" : "SUSPENDIDO"}`,
      { method: action === "DELETE" ? "DELETE" : "PATCH", token },
    )));
    const failed = outcomes.filter((result) => result.status === "rejected").length;
    setNotice(`${outcomes.length - failed} cuenta(s) procesadas${selected.length > eligible.length ? `; ${selected.length - eligible.length} omitidas por su estado` : ""}${failed ? `; ${failed} con error` : ""}.`);
    if (failed) setError(outcomes.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : "Error al procesar una cuenta.").join(" "));
    setSelectedIds([]);
    setWorking(false);
    await reload();
  }

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Panel Administrativo · Usuarios
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Cuentas y acceso
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            SaaS, personal de la firma y clientes con alcance asignado.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            aria-label="Actualizar usuarios"
            className="grid size-10 place-items-center rounded-lg border border-border bg-surface hover:bg-surface-hover"
          >
            <RefreshCw className="size-4" />
          </button>
          {scope !== "ADMIN" && <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Crear usuario
          </button>}
        </div>
      </header>
      {loadError && <ApiErrorState error={loadError} onRetry={() => void reload()} retrying={loading} compact />}
      {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-success/30 bg-success-light p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      <div
        role="group"
        aria-label="Ámbito de usuarios"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1"
      >
        {(
          [
            { id: "FIRMA", label: "Firma" },
            { id: "CLIENTES", label: "Clientes" },
            { id: "SAAS", label: "Abogados SaaS" },
            { id: "ADMIN", label: "Administradores" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scope === item.id}
            onClick={() => setScope(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${scope === item.id ? "bg-primary !text-white" : "text-foreground-muted hover:bg-surface-hover"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-[1fr_190px_190px]">
        <label className="relative">
          <span className="sr-only">Buscar usuarios</span>
          <Search className="absolute left-3 top-2.5 size-4 text-foreground-muted" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar nombre, correo o WhatsApp"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </label>
        <select
          aria-label="Filtrar rol"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="TODOS">Todos los perfiles</option>
          {Object.entries(roleLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar estado"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="TODOS">Todos los estados</option>
          {Object.entries(stateLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.length > 0 && visible.every((user) => selectedIds.includes(user.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...visible.map((user) => user.id)])] : current.filter((id) => !visible.some((user) => user.id === id)))} />Seleccionar resultados visibles</label><span className="text-sm text-foreground-muted">{selectedIds.length} seleccionadas</span><div className="ml-auto flex flex-wrap gap-2"><button type="button" disabled={working || !visible.some((user) => selectedIds.includes(user.id) && user.estado === "ACTIVO" && user.rol !== "ADMIN")} onClick={() => void bulkUserAction("SUSPEND")} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">Suspender</button><button type="button" disabled={working || !visible.some((user) => selectedIds.includes(user.id) && ["SUSPENDIDO", "RECHAZADO"].includes(user.estado) && user.rol !== "ADMIN")} onClick={() => void bulkUserAction("ACTIVATE")} className="rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50">Activar</button><button type="button" disabled={working || !selectedIds.some((id) => visible.some((user) => user.id === id && user.rol !== "ADMIN"))} onClick={() => void bulkUserAction("DELETE")} className="rounded-md border border-danger/30 px-3 py-2 text-xs text-danger disabled:opacity-50">Eliminar seleccionadas</button></div></div>
        <table aria-busy={loading} className="w-full min-w-230 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
              <th className="px-4 py-3"><span className="sr-only">Selección</span></th>
              <th className="px-4 py-3">Usuario</th>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Seguridad</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando cuentas...
                </td>
              </tr>
            ) : loadError && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-foreground-muted">
                  La lista no está disponible todavía. Usa «Reintentar» para volver a consultar.
                </td>
              </tr>
            ) : visible.length ? (
              visible.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(user.id)} onChange={() => setSelectedIds((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id])} aria-label={`Seleccionar ${user.nombre_completo}`} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      <Link className="hover:text-primary hover:underline" href={`/gestion-procesos/admin/usuarios/${user.id}`}>{user.nombre_completo}</Link>
                    </p>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {user.email} · {user.whatsapp_numero || "Sin WhatsApp"}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-foreground-secondary">
                    {roleLabels[user.rol]}
                  </td>
                  <td className="px-4 py-3 text-foreground-secondary">
                    {user.plan?.nombre || "Sin plan"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs ${user.estado === "ACTIVO" ? "bg-success-light text-success" : user.estado === "RECHAZADO" ? "bg-danger-light text-danger" : "bg-warning-light text-warning"}`}
                    >
                      {stateLabels[user.estado]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-foreground-muted">
                    {user.debe_cambiar_password
                      ? "Cambio requerido"
                      : "Acceso normal"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void sendPasswordReset(user)}
                        aria-label={`Enviar restablecimiento de contraseña a ${user.nombre_completo}`}
                        title="Enviar enlace para restablecer contraseña"
                        className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50"
                      >
                        <Mail className="size-4" />
                      </button>
                      {user.rol !== "ADMIN" && <>
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        aria-label={`Editar ${user.nombre_completo}`}
                        className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={working || user.debe_cambiar_password}
                        onClick={() => void forcePasswordChange(user)}
                        aria-label={`Forzar cambio de contraseña a ${user.nombre_completo}`}
                        className="grid size-9 place-items-center rounded-md border border-border hover:bg-surface-hover disabled:opacity-50"
                      >
                        <KeyRound className="size-4" />
                      </button>
                      {user.estado === "PENDIENTE_APROBACION" ? <Link href="/gestion-procesos/admin/solicitudes" className="inline-flex h-9 items-center rounded-md border border-border px-2.5 text-xs hover:bg-surface-hover">Revisar solicitud</Link> : <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void changeStatus(
                            user,
                            user.estado === "ACTIVO" ? "SUSPENDIDO" : "ACTIVO",
                          )
                        }
                        className="rounded-md border border-border px-2.5 text-xs hover:bg-surface-hover disabled:opacity-50"
                      >
                        {user.estado === "ACTIVO" ? "Suspender" : "Activar"}
                      </button>}
                      <button type="button" disabled={working} onClick={() => void deleteUser(user)} aria-label={`Eliminar ${user.nombre_completo}`} title="Eliminar cuenta" className="grid size-9 place-items-center rounded-md border border-danger/30 text-danger hover:bg-danger-light disabled:opacity-50"><Trash2 className="size-4" /></button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-sm text-foreground-muted"
                >
                  {users.length === 0 ? "Aún no hay cuentas en este ámbito." : "No hay cuentas que coincidan con los filtros."}
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
          aria-label={editing ? "Editar usuario" : "Crear usuario"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {scope === "SAAS"
                    ? "Abogados SaaS"
                    : scope === "FIRMA"
                      ? "Firma"
                      : scope === "CLIENTES"
                        ? "Clientes"
                      : "Ámbito global"}
                </p>
                <h2 className="mt-1 text-lg font-semibold">
                  {editing ? "Editar usuario" : "Crear usuario"}
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
                {editing ? "Perfil" : "Tipo de cuenta"}
                <select
                  value={form.rol}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      rol: event.target.value as Role,
                      plan_id: "",
                      creado_por_abogado_id: "",
                    })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                >
                  <option value="ABOGADO_ADMIN">Abogado de la firma</option>
                  <option value="CLIENTE">Cliente</option>
                  <option value="ABOGADO">Abogado SaaS</option>
                </select>
                {editing && <span className="mt-1 block text-xs text-foreground-muted">El rol solo cambia si la cuenta no tiene procesos, tareas ni documentos vinculados.</span>}
            </label>
            <label className="block text-sm font-medium">
              Nombre completo
              <input
                required
                value={form.nombre_completo}
                onChange={(event) =>
                  setForm({ ...form, nombre_completo: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
              />
            </label>
            {!editing && (
              <label className="block text-sm font-medium">
                Correo
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                />
              </label>
            )}
            <label className="block text-sm font-medium">
              WhatsApp
              <input
                value={form.whatsapp_numero}
                onChange={(event) =>
                  setForm({ ...form, whatsapp_numero: event.target.value })
                }
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
              />
            </label>
            {!editing && (
              <label className="block text-sm font-medium">
                Contraseña temporal
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={form.password_temporal}
                  onChange={(event) =>
                    setForm({ ...form, password_temporal: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                />
              </label>
            )}
            {form.rol === "ABOGADO" && (
              <label className="block text-sm font-medium">
                Plan SaaS
                <select
                  required
                  value={form.plan_id}
                  onChange={(event) =>
                    setForm({ ...form, plan_id: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                >
                  <option value="">Seleccionar plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {form.rol === "CLIENTE" && (
              <label className="block text-sm font-medium">
                Responsable interno
                <select
                  required
                  value={form.creado_por_abogado_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      creado_por_abogado_id: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5"
                >
                  <option value="">Seleccionar responsable</option>
                  {users
                    .filter((user) => user.rol === "ABOGADO_ADMIN")
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.nombre_completo}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <footer className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={working}
                onClick={() => setFormOpen(false)}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={working}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {working && <RefreshCw className="size-4 animate-spin" />}
                {editing ? "Guardar cambios" : "Crear cuenta"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
