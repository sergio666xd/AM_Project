"use client";

import { apiRequest } from "@/lib/api";

import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  Mail,
  MessageCircle,
  Save,
  Settings,
} from "lucide-react";

import { useSession } from "@/context/SessionContext";


export default function ConfiguracionAbogadoPage() {
  const { user, token, refreshUser } = useSession();

  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setEmail(user.notificaciones_email !== false);
      setWhatsapp(!!user.notificaciones_whatsapp);
    }
  }, [user]);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await apiRequest(
        `/api/auth/preferencias-notificaciones`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            notificaciones_email: email,
            notificaciones_whatsapp: whatsapp,
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No fue posible actualizar las preferencias.",
        );
      }

      await refreshUser();
      setMessage("Preferencias de notificación guardadas.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Error al guardar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {/* Encabezado */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-[var(--foreground-muted)]">
            <Settings className="size-4" />
            <span>Mi cuenta</span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Configuración
          </h1>

          <p className="mt-2 max-w-2xl text-sm text-[var(--foreground-muted)]">
            Personaliza las preferencias de tu cuenta y define cómo deseas
            recibir las alertas de tu despacho.
          </p>
        </div>

        <div className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:block">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
            Cuenta
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
            {user?.email || "Usuario"}
          </p>
        </div>
      </header>

      {/* Mensajes */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400"
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <Check className="size-4" />
          </div>

          <span>{message}</span>
        </div>
      )}

      {/* Notificaciones */}
      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        {/* Cabecera de sección */}
        <div className="flex items-start gap-4 border-b border-[var(--border)] p-5 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <Bell className="size-5 text-[var(--primary)]" />
          </div>

          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Notificaciones
            </h2>

            <p className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">
              Controla los canales mediante los cuales recibirás avisos
              relacionados con la gestión de tus procesos.
            </p>
          </div>
        </div>

        {/* Opciones */}
        <div className="divide-y divide-[var(--border)]">
          {/* Correo */}
          <NotificationOption
            icon={<Mail className="size-5" />}
            title="Correo electrónico"
            description={`Recibe avisos en ${
              user?.email || "tu correo electrónico"
            }.`}
            checked={email}
            onChange={setEmail}
          />

          {/* WhatsApp */}
          <NotificationOption
            icon={<MessageCircle className="size-5" />}
            title="WhatsApp"
            description={
              user?.whatsapp_numero
                ? `Recibe alertas en ${user.whatsapp_numero}.`
                : "Configura un número de WhatsApp en tu perfil para activar este canal."
            }
            checked={whatsapp}
            onChange={setWhatsapp}
            disabled={!user?.whatsapp_numero}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-secondary)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="text-xs leading-5 text-[var(--foreground-muted)]">
            Los cambios se aplicarán a las próximas alertas enviadas a tu
            cuenta.
          </div>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Guardando…" : "Guardar preferencias"}
          </button>
        </div>
      </section>

      {/* Información de cuenta */}
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Información de la cuenta
          </h2>

          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Datos actualmente asociados a tu cuenta.
          </p>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <AccountField
            label="Nombre"
            value={user?.nombre_completo || "No disponible"}
          />

          <AccountField
            label="Correo electrónico"
            value={user?.email || "No disponible"}
          />

          <AccountField
            label="WhatsApp"
            value={user?.whatsapp_numero || "No configurado"}
          />

          <AccountField
            label="Rol"
            value={user?.rol || "No disponible"}
          />
        </div>
      </section>
    </section>
  );
}

function NotificationOption({
  icon,
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center justify-between gap-5 p-5 transition sm:p-6 ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-[var(--surface-secondary)]"
      }`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-secondary)] text-[var(--foreground-muted)]">
          {icon}
        </div>

        <div className="min-w-0">
          <p className="font-medium text-[var(--foreground)]">{title}</p>

          <p className="mt-1 text-sm leading-6 text-[var(--foreground-muted)]">
            {description}
          </p>

          {disabled && (
            <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
              Requiere un número de WhatsApp configurado.
            </p>
          )}
        </div>
      </div>

      {/* Switch */}
      <span className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />

        <span
          className="
            block h-6 w-11 rounded-full
            bg-[var(--border)]
            transition
            peer-checked:bg-[var(--primary)]
            peer-focus-visible:ring-2
            peer-focus-visible:ring-[var(--primary)]/40
            peer-disabled:opacity-50
          "
        />

        <span
          className="
            pointer-events-none
            absolute left-1 top-1
            size-4 rounded-full
            bg-white shadow-sm
            transition-transform
            peer-checked:translate-x-5
          "
        />
      </span>
    </label>
  );
}

function AccountField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--foreground-muted)]">
        {label}
      </p>

      <p className="mt-2 truncate text-sm font-medium text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}