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
  Edit3,
  ExternalLink,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
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
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);

  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [form, setForm] = useState<ClientForm>(EMPTY_FORM);

  const [selected, setSelected] = useState<number[]>([]);

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


  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return items;

    return items.filter((client) =>
      `${client.nombre_completo} ${client.email} ${
        client.whatsapp_numero || ""
      } ${client.numero_documento || ""} ${client.domicilio || ""} ${client.direccion || ""}`
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
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium !text-white transition hover:opacity-90"
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

      {/* Client list */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface-secondary)]/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-semibold text-[var(--foreground)]">Directorio de clientes</h2>
            <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">Información y accesos rápidos por cliente.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Vista de clientes" className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
            <button type="button" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${viewMode === "cards" ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}><LayoutGrid className="size-3.5" />Fichas</button>
            <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${viewMode === "list" ? "bg-[var(--primary)] !text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]"}`}><List className="size-3.5" />Lista</button>
          </div>
          <button
            type="button"
            onClick={toggleSelectAll}
            disabled={filteredClients.length === 0}
            className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)] disabled:opacity-50 sm:self-auto"
          >
            <span className={`grid size-4 place-items-center rounded border ${allVisibleSelected ? "border-[var(--primary)] bg-[var(--primary)] !text-white" : "border-[var(--border)] bg-[var(--background)]"}`}>
              {allVisibleSelected && <Check className="size-3" />}
            </span>
            {allVisibleSelected ? "Quitar selección" : "Seleccionar visibles"}
          </button>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)]/60" />
            ))}
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
              {query ? <Search className="size-5" /> : <Users className="size-5" />}
            </div>
            <h3 className="mt-3 font-medium text-[var(--foreground)]">
              {query ? "No se encontraron clientes" : "No hay clientes registrados"}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-[var(--foreground-muted)]">
              {query ? "Prueba con otro nombre, correo o número de WhatsApp." : "Crea el primer cliente del despacho para comenzar a gestionar sus procesos."}
            </p>
            {!query && <button type="button" onClick={openCreateModal} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-medium !text-white"><Plus className="size-4" />Crear cliente</button>}
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
            {filteredClients.map((client) => {
              const isSelected = selected.includes(client.id);
              return (
                <article key={client.id} className={`flex min-w-0 flex-col rounded-xl border p-4 transition ${isSelected ? "border-[var(--primary)]/50 bg-[var(--primary)]/[0.035]" : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]/30 hover:shadow-sm"}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelected(client.id)}
                      aria-label={isSelected ? `Deseleccionar ${client.nombre_completo}` : `Seleccionar ${client.nombre_completo}`}
                      className={`mt-1 grid size-5 shrink-0 place-items-center rounded border transition ${isSelected ? "border-[var(--primary)] bg-[var(--primary)] !text-white" : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"}`}
                    >{isSelected && <Check className="size-3.5" />}</button>
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]">
                      {getInitials(client.nombre_completo)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="block truncate font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">
                        {client.nombre_completo}
                      </Link>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="size-3" />Acceso registrado
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 min-w-0 space-y-2 border-t border-[var(--border)] pt-3 text-sm text-[var(--foreground-muted)]">
                    <div className="flex min-w-0 items-center gap-2"><Mail className="size-3.5 shrink-0" /><span className="truncate" title={client.email}>{client.email}</span></div>
                    <div className="flex min-w-0 items-center gap-2"><MessageCircle className="size-3.5 shrink-0" /><span className="truncate">{client.whatsapp_numero || "Sin WhatsApp registrado"}</span></div>
                    {(client.numero_documento || client.domicilio) && <p className="truncate pl-[22px] text-xs">{[client.numero_documento, client.domicilio].filter(Boolean).join(" · ")}</p>}
                  </div>

                  <div className={`mt-auto grid ${client.chat_href ? "grid-cols-3" : "grid-cols-2"} gap-2 pt-4`}>
                    {client.chat_href && <Link href={client.chat_href} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg bg-[var(--primary)] px-2 text-xs font-medium !text-white transition hover:opacity-90" aria-label={`Abrir chat con ${client.nombre_completo}`}>
                      <MessageCircle className="size-3.5" /><span>Chat</span>
                    </Link>}
                    <button type="button" onClick={() => openEditModal(client)} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]">
                      <Edit3 className="size-3.5" /><span>Editar</span>
                    </button>
                    <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[var(--border)] px-2 text-xs font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-secondary)]">
                      <ExternalLink className="size-3.5" /><span>Ficha</span>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filteredClients.map((client) => {
              const isSelected = selected.includes(client.id);
              return (
                <div key={client.id} className={`flex flex-col gap-3 px-4 py-4 transition hover:bg-[var(--surface-secondary)]/50 sm:flex-row sm:items-center sm:px-5 ${isSelected ? "bg-[var(--primary)]/[0.035]" : ""}`}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <button type="button" onClick={() => toggleSelected(client.id)} aria-label={isSelected ? `Deseleccionar ${client.nombre_completo}` : `Seleccionar ${client.nombre_completo}`} className={`mt-1 grid size-5 shrink-0 place-items-center rounded border ${isSelected ? "border-[var(--primary)] bg-[var(--primary)] !text-white" : "border-[var(--border)] bg-[var(--background)]"}`}>{isSelected && <Check className="size-3.5" />}</button>
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]">{getInitials(client.nombre_completo)}</div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="block truncate font-semibold text-[var(--foreground)] hover:text-[var(--primary)]">{client.nombre_completo}</Link>
                      <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">{client.email} <span className="px-1">·</span>{client.whatsapp_numero || "Sin WhatsApp"}</p>
                      {(client.numero_documento || client.domicilio) && <p className="mt-1 truncate text-xs text-[var(--foreground-muted)]">{[client.numero_documento, client.domicilio].filter(Boolean).join(" · ")}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-8 sm:pl-0">
                    {client.chat_href && <Link href={client.chat_href} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-medium !text-white hover:opacity-90"><MessageCircle className="size-3.5" />Chat</Link>}
                    <button type="button" onClick={() => openEditModal(client)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"><Edit3 className="size-3.5" />Editar</button>
                    <Link href={`/gestion-procesos/abogado/clientes/${client.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-secondary)]"><ExternalLink className="size-3.5" />Ficha</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filteredClients.length > 0 && (
          <footer className="flex flex-col gap-1 border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--foreground-muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>Mostrando {filteredClients.length} de {items.length} clientes</span>
            {selectedVisibleCount > 0 && <span>{selectedVisibleCount} seleccionado{selectedVisibleCount === 1 ? "" : "s"}</span>}
          </footer>
        )}
      </section>
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

              <label className="block text-sm font-medium text-[var(--foreground)]">
                Enviar credenciales por
                <select value={form.canal_envio} onChange={(event) => setForm((current) => ({ ...current, canal_envio: event.target.value as "EMAIL" | "WHATSAPP" }))} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm">
                  <option value="EMAIL">Correo electrónico</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-[var(--foreground-muted)]">Se enviarán el usuario, la contraseña temporal y un botón para ingresar al portal. El cliente deberá cambiar la contraseña al iniciar sesión.</span>
              </label>
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
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
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

              <label className="block text-sm font-medium text-[var(--foreground)]">
                Género
                <select
                  value={form.genero}
                  onChange={(event) => setForm((current) => ({ ...current, genero: event.target.value as ClientForm["genero"] }))}
                  className="mt-1.5 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm text-[var(--foreground)]"
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
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium !text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
