"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KeyRound, Mail, PauseCircle, Pencil, PlayCircle, Plus, Trash2, UserCheck, UserRound, X } from "lucide-react";
import { apiRequest, fetchApi } from "@/lib/api";
import { ApiErrorState } from "@/components/ui/ApiErrorState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useSession } from "@/context/SessionContext";

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
const scopeRole: Record<Scope, Role> = {
  FIRMA: "ABOGADO_ADMIN",
  CLIENTES: "CLIENTE",
  SAAS: "ABOGADO",
  ADMIN: "ADMIN",
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
  const [status, setStatus] = useState("TODOS");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const { token } = useSession();

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
        const matchesStatus = status === "TODOS" || user.estado === status;
        return scopeRole[scope] === user.rol && matchesStatus;
      }),
    [users, scope, status],
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

  async function bulkUserAction(action: "ACTIVATE" | "SUSPEND" | "DELETE", rows: User[]) {
    const selected = rows.filter((user) => user.rol !== "ADMIN");
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
    setWorking(false);
    await reload();
  }

  const scopeCount = (target: Scope) => users.filter((user) => scopeRole[target] === user.rol).length;
  const userColumns: DataTableColumn<User>[] = [
    {
      key: "nombre_completo",
      header: "Nombre",
      mobile: "title",
      sortValue: (user) => user.nombre_completo,
      render: (user) => (
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="hidden size-9 shrink-0 place-items-center rounded-full bg-primary-light text-xs font-semibold text-primary md:grid">
            {user.nombre_completo.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </span>
          <span className="truncate">{user.nombre_completo}</span>
        </span>
      ),
    },
    { key: "email", header: "Correo", mobile: "subtitle", sortValue: (user) => user.email, render: (user) => <span className="block max-w-64 truncate" title={user.email}>{user.email}</span> },
    { key: "whatsapp_numero", header: "WhatsApp", mobile: "meta", sortValue: (user) => user.whatsapp_numero, render: (user) => user.whatsapp_numero || <span className="text-foreground-muted">Sin registrar</span> },
    ...(scope === "SAAS"
      ? [{ key: "plan", header: "Plan", mobile: "meta" as const, sortValue: (user: User) => user.plan?.nombre, render: (user: User) => user.plan?.nombre || <span className="text-foreground-muted">Sin plan</span> }]
      : []),
    {
      key: "estado",
      header: "Estado",
      mobile: "badge",
      sortValue: (user) => stateLabels[user.estado],
      render: (user) => <Badge tone={user.estado === "ACTIVO" ? "completed" : user.estado === "RECHAZADO" ? "rejected" : "pending"}>{stateLabels[user.estado]}</Badge>,
    },
    {
      key: "seguridad",
      header: "Acceso",
      mobile: "badge",
      sortValue: (user) => (user.debe_cambiar_password ? 1 : 0),
      exportValue: (user) => (user.debe_cambiar_password ? "Debe cambiar contraseña" : "Normal"),
      render: (user) => user.debe_cambiar_password ? <Badge tone="attention">Debe cambiar contraseña</Badge> : <span className="text-xs text-foreground-muted">Normal</span>,
    },
  ];

  const userActions: RowAction<User>[] = [
    { label: "Ver ficha", icon: <UserRound />, href: (user) => `/gestion-procesos/admin/usuarios/${user.id}` },
    { label: "Editar datos", icon: <Pencil />, onSelect: (user) => openEdit(user), hidden: (user) => user.rol === "ADMIN" },
    { label: "Enviar enlace para restablecer contraseña", icon: <Mail />, onSelect: (user) => sendPasswordReset(user), disabled: () => working },
    { label: "Exigir cambio de contraseña", icon: <KeyRound />, onSelect: (user) => forcePasswordChange(user), hidden: (user) => user.rol === "ADMIN", disabled: (user) => working || Boolean(user.debe_cambiar_password) },
    { label: "Revisar solicitud de registro", icon: <UserCheck />, href: () => "/gestion-procesos/admin/solicitudes", hidden: (user) => user.estado !== "PENDIENTE_APROBACION" },
    { label: "Suspender acceso", icon: <PauseCircle />, separated: true, onSelect: (user) => changeStatus(user, "SUSPENDIDO"), hidden: (user) => user.rol === "ADMIN" || user.estado !== "ACTIVO", disabled: () => working },
    { label: "Reactivar acceso", icon: <PlayCircle />, separated: true, onSelect: (user) => changeStatus(user, "ACTIVO"), hidden: (user) => user.rol === "ADMIN" || (user.estado !== "SUSPENDIDO" && user.estado !== "RECHAZADO"), disabled: () => working },
    { label: "Eliminar cuenta", icon: <Trash2 />, tone: "danger", onSelect: (user) => deleteUser(user), hidden: (user) => user.rol === "ADMIN", disabled: () => working },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Administración · Personas"
        title="Usuarios"
        description="Cuentas del equipo de la firma, clientes y administradores, con su estado de acceso."
        action={scope !== "ADMIN" && <Button variant="primary" onClick={openCreate} icon={<Plus className="size-4" />}>{scope === "CLIENTES" ? "Nuevo cliente" : "Nuevo usuario"}</Button>}
      />
      {loadError && <ApiErrorState error={loadError} onRetry={() => void reload()} retrying={loading} compact />}
      {error && <p role="alert" className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-light p-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="rounded-[var(--radius-lg)] border border-success/30 bg-success-light p-3 text-sm text-success">{notice}</p>}

      <SegmentedControl
        label="Tipo de cuenta"
        value={scope}
        onChange={(value) => { setScope(value); setStatus("TODOS"); }}
        options={[
          { value: "FIRMA", label: "Equipo de la firma", count: scopeCount("FIRMA") },
          { value: "CLIENTES", label: "Clientes", count: scopeCount("CLIENTES") },
          { value: "ADMIN", label: "Administradores", count: scopeCount("ADMIN") },
          ...(scopeCount("SAAS") > 0 || scope === "SAAS" ? [{ value: "SAAS" as const, label: "SaaS heredado", count: scopeCount("SAAS") }] : []),
        ]}
      />

      <DataTable
        caption="Usuarios"
        rows={visible}
        columns={userColumns}
        rowKey={(user) => user.id}
        rowHref={(user) => `/gestion-procesos/admin/usuarios/${user.id}`}
        rowActions={userActions}
        bulkActions={scope === "ADMIN" ? undefined : [
          { label: "Activar", icon: <PlayCircle />, onRun: (rows) => bulkUserAction("ACTIVATE", rows) },
          { label: "Suspender", icon: <PauseCircle />, onRun: (rows) => bulkUserAction("SUSPEND", rows) },
          { label: "Eliminar", icon: <Trash2 />, tone: "danger", onRun: (rows) => bulkUserAction("DELETE", rows) },
        ]}
        rowTone={(user) => (user.estado === "SUSPENDIDO" ? "warning" : undefined)}
        searchPlaceholder="Buscar por nombre, correo o WhatsApp"
        initialSort={{ key: "nombre_completo", direction: "asc" }}
        exportFilename={`usuarios-${scope.toLowerCase()}`}
        storageKey={`admin-usuarios-${scope}`}
        loading={loading}
        onRefresh={() => void reload()}
        activeFilterCount={status === "TODOS" ? 0 : 1}
        toolbar={
          <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-[var(--radius-md)] border border-border bg-background px-3 text-sm text-foreground">
            <option value="TODOS">Todos los estados</option>
            {Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        }
        emptyTitle={users.length === 0 ? "Aún no hay cuentas" : "No hay cuentas en esta sección"}
        emptyDescription={status !== "TODOS" ? "Prueba con otro estado." : undefined}
      />

      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Editar usuario" : "Crear usuario"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4"
        >
          <form
            onSubmit={save}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-2xl"
          >
            <header className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
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
              <Button variant="outline" onClick={() => setFormOpen(false)} disabled={working}>Cancelar</Button>
              <Button type="submit" variant="primary" loading={working} icon={working ? undefined : undefined}>
                {editing ? "Guardar cambios" : "Crear cuenta"}
              </Button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}
