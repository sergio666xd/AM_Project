"use client";

import { apiRequest } from "@/lib/api";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  Check,
  ChevronDown,
  Edit3,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";


type Client = {
  id: number;
  nombre_completo: string;
  email: string;
  whatsapp_numero?: string;
};

type ClientForm = {
  nombre_completo: string;
  email: string;
  whatsapp_numero: string;
  password_temporal: string;
};

const EMPTY_FORM: ClientForm = {
  nombre_completo: "",
  email: "",
  whatsapp_numero: "",
  password_temporal: "",
};

export default function ClientesPage() {
  const [items, setItems] = useState<Client[]>([]);
  const [query, setQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  const [selected, setSelected] = useState<number[]>([]);
  const [openMenu, setOpenMenu] = useState<number | null>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const closeMenu = () => setOpenMenu(null);

    window.addEventListener("click", closeMenu);

    return () => {
      window.removeEventListener("click", closeMenu);
    };
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return items;

    return items.filter((client) =>
      `${client.nombre_completo} ${client.email} ${
        client.whatsapp_numero || ""
      }`
        .toLowerCase()
        .includes(normalized)
    );
  }, [items, query]);

  const selectedVisibleCount = useMemo(
    () =>
      filteredClients.filter((client) =>
        selected.includes(client.id)
      ).length,
    [filteredClients, selected]
  );

  const allVisibleSelected =
    filteredClients.length > 0 &&
    filteredClients.every((client) => selected.includes(client.id));

  const toggleSelected = (id: number) => {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected((current) =>
        current.filter(
          (id) => !filteredClients.some((client) => client.id === id)
        )
      );
      return;
    }

    setSelected((current) => [
      ...new Set([
        ...current,
        ...filteredClients.map((client) => client.id),
      ]),
    ]);
  };

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
      password_temporal: "",
    });

    setOpenEdit(true);
    setOpenMenu(null);
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
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible crear el cliente."
        );
      }

      setNotice("Cliente creado correctamente con acceso temporal.");
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

  const removeFromSelection = (id: number) => {
    setSelected((current) => current.filter((item) => item !== id));
  };

  const clearSelection = () => {
    setSelected([]);
  };

  return (
    <section className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
            <Users className="size-4" />
            <span>Despacho</span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Clientes
          </h1>

          <p className="mt-1 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Gestiona los clientes, sus accesos y la relación con los
            procesos del despacho.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="size-4" />
          Nuevo cliente
        </button>
      </header>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            className="shrink-0 rounded p-1 hover:bg-red-500/10"
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
            className="shrink-0 rounded p-1 hover:bg-emerald-500/10"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Clientes registrados
              </p>

              <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                {items.length}
              </p>
            </div>

            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Users className="size-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Resultados
              </p>

              <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                {filteredClients.length}
              </p>
            </div>

            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
              <Search className="size-5" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--foreground-muted)]">
                Seleccionados
              </p>

              <p className="mt-1 text-2xl font-semibold text-[var(--foreground)]">
                {selected.length}
              </p>
            </div>

            <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
              <Check className="size-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-muted)]" />

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre, correo o WhatsApp..."
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex items-center gap-2">
            {selected.length > 0 && (
              <>
                <span className="hidden text-sm text-[var(--foreground-muted)] sm:inline">
                  {selected.length} seleccionado
                  {selected.length !== 1 ? "s" : ""}
                </span>

                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
                >
                  <X className="size-4" />
                  Limpiar
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
              <tr>
                <th className="w-12 px-4 py-3">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label={
                      allVisibleSelected
                        ? "Deseleccionar todos"
                        : "Seleccionar todos"
                    }
                    className={`flex size-5 items-center justify-center rounded border transition ${
                      allVisibleSelected
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                        : "border-[var(--border)] bg-[var(--background)]"
                    }`}
                  >
                    {allVisibleSelected && (
                      <Check className="size-3.5" />
                    )}
                  </button>
                </th>

                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Cliente
                </th>

                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Correo
                </th>

                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  WhatsApp
                </th>

                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Acceso
                </th>

                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr
                    key={index}
                    className="border-b border-[var(--border)] last:border-b-0"
                  >
                    <td className="px-4 py-4">
                      <div className="size-5 animate-pulse rounded bg-[var(--surface-secondary)]" />
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-9 animate-pulse rounded-full bg-[var(--surface-secondary)]" />
                        <div className="space-y-2">
                          <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-secondary)]" />
                          <div className="h-2.5 w-20 animate-pulse rounded bg-[var(--surface-secondary)]" />
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-secondary)]" />
                    </td>

                    <td className="px-4 py-4">
                      <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-secondary)]" />
                    </td>

                    <td className="px-4 py-4">
                      <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--surface-secondary)]" />
                    </td>

                    <td className="px-4 py-4">
                      <div className="ml-auto h-8 w-24 animate-pulse rounded bg-[var(--surface-secondary)]" />
                    </td>
                  </tr>
                ))
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center"
                  >
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
                      {query ? (
                        <Search className="size-5" />
                      ) : (
                        <Users className="size-5" />
                      )}
                    </div>

                    <h3 className="mt-3 font-medium text-[var(--foreground)]">
                      {query
                        ? "No se encontraron clientes"
                        : "No hay clientes registrados"}
                    </h3>

                    <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
                      {query
                        ? "Prueba con otro nombre, correo o número de WhatsApp."
                        : "Crea el primer cliente del despacho para comenzar a gestionar sus procesos."}
                    </p>

                    {!query && (
                      <button
                        type="button"
                        onClick={openCreateModal}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
                      >
                        <Plus className="size-4" />
                        Crear cliente
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => {
                  const isSelected = selected.includes(client.id);

                  return (
                    <tr
                      key={client.id}
                      className={`border-b border-[var(--border)] transition last:border-b-0 hover:bg-[var(--surface-secondary)]/60 ${
                        isSelected
                          ? "bg-[var(--primary)]/[0.04]"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-4 align-middle">
                        <button
                          type="button"
                          onClick={() => toggleSelected(client.id)}
                          aria-label={
                            isSelected
                              ? `Deseleccionar ${client.nombre_completo}`
                              : `Seleccionar ${client.nombre_completo}`
                          }
                          className={`flex size-5 items-center justify-center rounded border transition ${
                            isSelected
                              ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                              : "border-[var(--border)] bg-[var(--background)]"
                          }`}
                        >
                          {isSelected && (
                            <Check className="size-3.5" />
                          )}
                        </button>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]">
                            {getInitials(client.nombre_completo)}
                          </div>

                          <div className="min-w-0">
                            <Link
                              href={`/gestion-procesos/abogado/clientes/${client.id}`}
                              className="block truncate font-medium text-[var(--foreground)] hover:text-[var(--primary)]"
                            >
                              {client.nombre_completo}
                            </Link>

                            <p className="text-xs text-[var(--foreground-muted)]">
                              Cliente
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-[var(--foreground-muted)]">
                        <div className="flex items-center gap-2">
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">
                            {client.email}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-[var(--foreground-muted)]">
                        {client.whatsapp_numero || "—"}
                      </td>

                      <td className="px-4 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="size-3.5" />
                          Registrado
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/gestion-procesos/abogado/clientes/${client.id}`}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]"
                          >
                            <ExternalLink className="size-3.5" />
                            <span className="hidden xl:inline">
                              Abrir ficha
                            </span>
                          </Link>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenu((current) =>
                                  current === client.id
                                    ? null
                                    : client.id
                                );
                              }}
                              aria-label={`Acciones para ${client.nombre_completo}`}
                              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
                            >
                              <MoreHorizontal className="size-4" />
                            </button>

                            {openMenu === client.id && (
                              <div
                                onClick={(event) =>
                                  event.stopPropagation()
                                }
                                className="absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl"
                              >
                                <Link
                                  href={`/gestion-procesos/abogado/clientes/${client.id}`}
                                  onClick={() => setOpenMenu(null)}
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
                                >
                                  <ExternalLink className="size-4" />
                                  Abrir ficha
                                </Link>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openEditModal(client)
                                  }
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
                                >
                                  <Edit3 className="size-4" />
                                  Editar cliente
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleSelected(client.id);
                                    setOpenMenu(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"
                                >
                                  <Check className="size-4" />
                                  {isSelected
                                    ? "Quitar selección"
                                    : "Seleccionar"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredClients.length > 0 && (
          <footer className="flex flex-col gap-2 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--foreground-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>
              Mostrando {filteredClients.length} de {items.length}{" "}
              cliente{items.length !== 1 ? "s" : ""}
            </span>

            {selectedVisibleCount > 0 && (
              <span>
                {selectedVisibleCount} visible
                {selectedVisibleCount !== 1 ? "s" : ""} seleccionado
                {selectedVisibleCount !== 1 ? "s" : ""}
              </span>
            )}
          </footer>
        )}
      </div>

      {/* Create modal */}
      {openCreate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCreateModal();
            }
          }}
        >
          <form
            onSubmit={createClient}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                  <UserPlus className="size-5" />
                </div>

                <h2
                  id="create-client-title"
                  className="text-lg font-semibold text-[var(--foreground)]"
                >
                  Nuevo cliente
                </h2>

                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Crea el acceso del cliente al sistema.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
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
            </div>

            <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button
                type="button"
                onClick={closeCreateModal}
                disabled={saving}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEditModal();
            }
          }}
        >
          <form
            onSubmit={updateClient}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                  <Edit3 className="size-5" />
                </div>

                <h2
                  id="edit-client-title"
                  className="text-lg font-semibold text-[var(--foreground)]"
                >
                  Editar cliente
                </h2>

                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Actualiza la información de contacto del cliente.
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--foreground)]"
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
            </div>

            <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={saving}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="text-sm font-medium text-[var(--foreground)]">
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
        className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)] disabled:cursor-not-allowed disabled:bg-[var(--surface-secondary)] disabled:opacity-70"
      />

      {hint && (
        <p className="mt-1.5 text-xs text-[var(--foreground-muted)]">
          {hint}
        </p>
      )}
    </label>
  );
}