"use client";

import { apiRequest } from "@/lib/api";

import {
  FormEvent,
  useCallback,
  useState,
} from "react";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn, type RowAction } from "@/components/ui/DataTable";

import {
  Edit3,
  ExternalLink,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  UserPlus,
  X,
} from "lucide-react";
import { useLoadEffect } from "@/lib/useLoadEffect";


type Client = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero?: string;
  genero?: "MASCULINO" | "FEMENINO" | null;
  numero_documento?: string | null;
  domicilio?: string | null;
  direccion?: string | null;
  chat_href?: string | null;
};

type ClientForm = {
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  genero: "" | "MASCULINO" | "FEMENINO";
  numero_documento: string;
  domicilio: string;
  direccion: string;
  password_temporal: string;
  canal_envio: "EMAIL" | "WHATSAPP";
};

const EMPTY_FORM: ClientForm = {
  nombre_completo: "",
  email: "",
  whatsapp_numero: "",
  genero: "",
  numero_documento: "",
  domicilio: "",
  direccion: "",
  password_temporal: "",
  canal_envio: "EMAIL",
};

export default function ClientesPage() {
  const [items, setItems] = useState<Client[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);


  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
    }),
    []
  );

  const clearMessages = useCallback(() => {
    setError("");
    setNotice("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest(
        `/api/expedientes/clientes`,
        {
          headers: headers(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible cargar los clientes."
        );
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar los clientes."
      );
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useLoadEffect(load);


  const clientColumns: DataTableColumn<Client>[] = [
    {
      key: "nombre_completo",
      header: "Cliente",
      mobile: "title",
      sortValue: (client) => client.nombre_completo,
      searchValue: (client) => `${client.nombre_completo} ${client.numero_documento ?? ""}`,
      render: (client) => (
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="hidden size-9 shrink-0 place-items-center rounded-full bg-primary-light text-xs font-semibold text-primary md:grid">
            {getInitials(client.nombre_completo)}
          </span>
          <span className="min-w-0 truncate">{client.nombre_completo}</span>
        </span>
      ),
    },
    {
      key: "email",
      header: "Correo",
      mobile: "subtitle",
      sortValue: (client) => client.email,
      render: (client) => <span className="block max-w-64 truncate" title={client.email}>{client.email}</span>,
    },
    {
      key: "whatsapp_numero",
      header: "WhatsApp",
      mobile: "meta",
      sortValue: (client) => client.whatsapp_numero,
      render: (client) => client.whatsapp_numero || <span className="text-foreground-muted">Sin registrar</span>,
    },
    {
      key: "numero_documento",
      header: "Documento",
      mobile: "meta",
      sortValue: (client) => client.numero_documento,
      render: (client) => client.numero_documento || <span className="text-foreground-muted">—</span>,
    },
    {
      key: "domicilio",
      header: "Domicilio",
      mobile: "hidden",
      hideOnMobile: true,
      sortValue: (client) => client.domicilio,
      searchValue: (client) => `${client.domicilio ?? ""} ${client.direccion ?? ""}`,
      render: (client) => client.domicilio || <span className="text-foreground-muted">—</span>,
    },
  ];

  const clientActions: RowAction<Client>[] = [
    { label: "Abrir ficha", icon: <ExternalLink />, href: (client) => `/gestion-procesos/abogado/clientes/${client.id}` },
    { label: "Abrir chat", icon: <MessageCircle />, href: (client) => client.chat_href || "#", hidden: (client) => !client.chat_href },
    { label: "Editar datos", icon: <Edit3 />, onSelect: (client) => openEditModal(client) },
    { label: "Enviar correo", icon: <Mail />, href: (client) => `mailto:${client.email}`, separated: true },
    {
      label: "Escribir por WhatsApp",
      icon: <Phone />,
      href: (client) => `https://wa.me/${whatsappDigits(client.whatsapp_numero)}`,
      hidden: (client) => !client.whatsapp_numero,
    },
  ];

  const openCreateModal = () => {
    clearMessages();
    setForm(EMPTY_FORM);
    setOpenCreate(true);
  };

  const closeCreateModal = () => {
    if (saving) return;

    setOpenCreate(false);
    setForm(EMPTY_FORM);
  };

  const openEditModal = (client: Client) => {
    clearMessages();
    setEditingClient(client);

    setForm({
      nombre_completo: client.nombre_completo,
      email: client.email,
      whatsapp_numero: client.whatsapp_numero || "",
      genero: client.genero || "",
      numero_documento: client.numero_documento || "",
      domicilio: client.domicilio || "",
      direccion: client.direccion || "",
      password_temporal: "",
      canal_envio: "EMAIL",
    });

    setOpenEdit(true);
  };

  const closeEditModal = () => {
    if (saving) return;

    setOpenEdit(false);
    setEditingClient(null);
    setForm(EMPTY_FORM);
  };

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    clearMessages();
    setSaving(true);

    try {
      const response = await apiRequest(
        `/api/expedientes/clientes`,
        {
          method: "POST",
          headers: {
            ...headers(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre_completo: form.nombre_completo.trim(),
            email: form.email.trim(),
            whatsapp_numero: form.whatsapp_numero.trim(),
            password_temporal: form.password_temporal,
            canal_envio: form.canal_envio,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible crear el cliente."
        );
      }

      setNotice(data.mensaje || "Cliente creado correctamente; credenciales programadas para envío.");
      setOpenCreate(false);
      setForm(EMPTY_FORM);

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al crear el cliente."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingClient) return;

    clearMessages();
    setSaving(true);

    try {
      const response = await apiRequest(
        `/api/expedientes/clientes/${editingClient.id}`,
        {
          method: "PUT",
          headers: {
            ...headers(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nombre_completo: form.nombre_completo.trim(),
            whatsapp_numero: form.whatsapp_numero.trim(),
            genero: form.genero || null,
            numero_documento: form.numero_documento.trim(),
            domicilio: form.domicilio.trim(),
            direccion: form.direccion.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible actualizar el cliente."
        );
      }

      setNotice("Cliente actualizado correctamente.");
      setOpenEdit(false);
      setEditingClient(null);
      setForm(EMPTY_FORM);

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al actualizar el cliente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        overline="Despacho"
        title="Clientes"
        description="Gestiona los clientes, sus accesos y la relación con los procesos del despacho."
        action={
          <Button variant="primary" onClick={openCreateModal} icon={<Plus className="size-4" />}>
            Nuevo cliente
          </Button>
        }
      />

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-100 px-4 py-3 text-sm text-danger"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 rounded p-1 hover:bg-danger/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-success/30 bg-success-100 px-4 py-3 text-sm text-success"
        >
          <span>{notice}</span>

          <button
            type="button"
            onClick={() => setNotice("")}
            className="shrink-0 rounded p-1 hover:bg-success/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <DataTable
        caption="Clientes del despacho"
        rows={items}
        columns={clientColumns}
        rowKey={(client) => client.id}
        rowHref={(client) => `/gestion-procesos/abogado/clientes/${client.id}`}
        rowActions={clientActions}
        searchPlaceholder="Buscar por nombre, documento, correo o WhatsApp"
        initialSort={{ key: "nombre_completo", direction: "asc" }}
        exportFilename="clientes"
        storageKey="abogado-clientes"
        loading={loading}
        onRefresh={() => void load()}
        emptyTitle="Aún no hay clientes"
        emptyDescription="Crea el primer cliente del despacho para empezar a gestionar sus procesos."
        emptyAction={<Button variant="primary" onClick={openCreateModal} icon={<Plus className="size-4" />}>Crear cliente</Button>}
      />
      {/* Create modal */}
      {openCreate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <form
            onSubmit={createClient}
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-brand-900/10 text-brand-900">
                  <UserPlus className="size-5" />
                </div>

                <h2
                  id="create-client-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Nuevo cliente
                </h2>

                <p className="mt-1 text-sm text-foreground-muted">
                  Crea el acceso del cliente al sistema.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-2 text-foreground-muted hover:bg-surface-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-5">
              <ClientField
                label="Nombre completo"
                value={form.nombre_completo}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    nombre_completo: value,
                  }))
                }
                required
                autoFocus
              />

              <ClientField
                label="Correo electrónico"
                type="email"
                value={form.email}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    email: value,
                  }))
                }
                required
              />

              <ClientField
                label="WhatsApp"
                type="tel"
                value={form.whatsapp_numero}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    whatsapp_numero: value,
                  }))
                }
                placeholder="Opcional"
                required={form.canal_envio === "WHATSAPP"}
              />

              <ClientField
                label="Contraseña temporal"
                type="password"
                value={form.password_temporal}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    password_temporal: value,
                  }))
                }
                minLength={8}
                required
                hint="Debe tener al menos 8 caracteres."
              />

              <label className="block text-sm font-medium text-foreground">
                Enviar credenciales por
                <select value={form.canal_envio} onChange={(event) => setForm((current) => ({ ...current, canal_envio: event.target.value as "EMAIL" | "WHATSAPP" }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm">
                  <option value="EMAIL">Correo electrónico</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-foreground-muted">Se enviarán el usuario, la contraseña temporal y un botón para ingresar al portal. El cliente deberá cambiar la contraseña al iniciar sesión.</span>
              </label>
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-secondary disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && (
                  <RefreshCw className="size-4 animate-spin" />
                )}
                {saving ? "Creando..." : "Crear cliente"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* Edit modal */}
      {openEdit && editingClient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-brand-950/40 backdrop-blur-sm p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
          }}
        >
          <form
            onSubmit={updateClient}
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-brand-900/10 text-brand-900">
                  <Edit3 className="size-5" />
                </div>

                <h2
                  id="edit-client-title"
                  className="text-lg font-semibold text-foreground"
                >
                  Editar cliente
                </h2>

                <p className="mt-1 text-sm text-foreground-muted">
                  Actualiza la información de contacto del cliente.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-2 text-foreground-muted hover:bg-surface-secondary hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="space-y-4 overflow-y-auto px-5 py-5">
              <ClientField
                label="Nombre completo"
                value={form.nombre_completo}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    nombre_completo: value,
                  }))
                }
                required
                autoFocus
              />

              <ClientField
                label="Correo electrónico"
                type="email"
                value={form.email}
                disabled
                hint="El correo se utiliza como identificador de acceso y no se modifica desde esta ficha."
              />

              <ClientField
                label="WhatsApp"
                type="tel"
                value={form.whatsapp_numero}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    whatsapp_numero: value,
                  }))
                }
                placeholder="Opcional"
              />

              <label className="block text-sm font-medium text-foreground">
                Género
                <select
                  value={form.genero}
                  onChange={(event) => setForm((current) => ({ ...current, genero: event.target.value as ClientForm["genero"] }))}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground"
                >
                  <option value="">Sin especificar</option>
                  <option value="FEMENINO">Femenino</option>
                  <option value="MASCULINO">Masculino</option>
                </select>
              </label>

              <ClientField
                label="Número de documento"
                value={form.numero_documento}
                onChange={(value) => setForm((current) => ({ ...current, numero_documento: value }))}
                placeholder="Sin puntos"
              />

              <ClientField
                label="Domicilio"
                value={form.domicilio}
                onChange={(value) => setForm((current) => ({ ...current, domicilio: value }))}
                placeholder="Ciudad o municipio"
              />

              <ClientField
                label="Dirección"
                value={form.direccion}
                onChange={(value) => setForm((current) => ({ ...current, direccion: value }))}
                placeholder="Dirección de residencia"
              />
            </div>

            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-secondary disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-900 px-4 py-2 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving && (
                  <RefreshCw className="size-4 animate-spin" />
                )}
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

/** Número para enlaces de WhatsApp; los celulares colombianos sin indicativo lo reciben. */
function whatsappDigits(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length === 10 && digits.startsWith("3") ? `57${digits}` : digits;
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "?";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type ClientFieldProps = {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  minLength?: number;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
};

function ClientField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  disabled = false,
  minLength,
  placeholder,
  hint,
  autoFocus = false,
}: ClientFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        required={required}
        disabled={disabled}
        minLength={minLength}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="mt-1.5 h-10 w-full rounded-lg border border-border bg-[var(--background)] px-3 text-sm text-foreground outline-none transition placeholder:text-foreground-muted focus:border-brand-900 disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-70"
      />

      {hint && (
        <p className="mt-1.5 text-xs text-foreground-muted">
          {hint}
        </p>
      )}
    </label>
  );
}
