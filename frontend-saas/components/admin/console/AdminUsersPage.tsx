"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { fetchApi } from "@/lib/api";

type Role = "ABOGADO_ADMIN" | "ABOGADO" | "CLIENTE";
type Status = "ACTIVO" | "PENDIENTE_APROBACION" | "RECHAZADO";
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
type Scope = "GLOBAL" | "FIRMA" | "SAAS";
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
  ABOGADO: "Abogado SaaS",
  CLIENTE: "Cliente",
};
const stateLabels: Record<Status, string> = {
  ACTIVO: "Activo",
  PENDIENTE_APROBACION: "Pendiente",
  RECHAZADO: "Suspendido",
};

async function loadOptions(token: string) {
  const [users, plans] = await Promise.all([
    fetchApi("/api/admin/usuarios", { method: "GET", token }),
    fetchApi("/api/admin/planes", { method: "GET", token }),
  ]);
  return { users: users as User[], plans: plans as Plan[] };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [scope, setScope] = useState<Scope>("GLOBAL");
  const [role, setRole] = useState("TODOS");
  const [status, setStatus] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
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
        }
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
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
    setError("");
    try {
      const result = await loadOptions(token);
      setUsers(result.users);
      setPlans(result.plans.filter((plan) => plan.activo));
    } catch (cause) {
      setError(
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
        const firmOwnerIds = new Set(
          users
            .filter((item) => item.rol === "ABOGADO_ADMIN")
            .map((item) => item.id),
        );
        const inScope =
          scope === "GLOBAL" ||
          (scope === "SAAS" && user.rol === "ABOGADO") ||
          (scope === "FIRMA" &&
            (user.rol === "ABOGADO_ADMIN" ||
              (user.rol === "CLIENTE" &&
                firmOwnerIds.has(user.creado_por_abogado_id || -1))));
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
    setForm({ ...initialForm, plan_id: plans[0] ? String(plans[0].id) : "" });
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
      await fetchApi("/api/admin/usuarios/estado-masivo", {
        method: "PATCH",
        token,
        body: JSON.stringify({ usuario_ids: [user.id], estado: next }),
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
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="size-4" />
            Crear usuario
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
      <div
        role="group"
        aria-label="Ámbito de usuarios"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1"
      >
        {(
          [
            { id: "GLOBAL", label: "Global" },
            { id: "FIRMA", label: "Firma" },
            { id: "SAAS", label: "SaaS individual" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={scope === item.id}
            onClick={() => setScope(item.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${scope === item.id ? "bg-primary text-white" : "text-foreground-muted hover:bg-surface-hover"}`}
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
        <table className="w-full min-w-230 text-left text-sm">
          <thead className="border-b border-border bg-surface-secondary text-xs uppercase text-foreground-muted">
            <tr>
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
                  colSpan={6}
                  className="px-4 py-10 text-center text-foreground-muted"
                >
                  Cargando cuentas...
                </td>
              </tr>
            ) : visible.length ? (
              visible.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {user.nombre_completo}
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
                      <button
                        type="button"
                        disabled={working}
                        onClick={() =>
                          void changeStatus(
                            user,
                            user.estado === "ACTIVO" ? "RECHAZADO" : "ACTIVO",
                          )
                        }
                        className="rounded-md border border-border px-2.5 text-xs hover:bg-surface-hover disabled:opacity-50"
                      >
                        {user.estado === "ACTIVO" ? "Suspender" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-sm text-foreground-muted"
                >
                  No hay cuentas para este filtro.
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
                    ? "SaaS individual"
                    : scope === "FIRMA"
                      ? "Firma"
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
            {!editing && (
              <label className="block text-sm font-medium">
                Tipo de cuenta
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
              </label>
            )}
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
