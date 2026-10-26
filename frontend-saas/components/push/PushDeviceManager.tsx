"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, Monitor, Smartphone, Tablet, Trash2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { fetchApi, apiRequest } from "@/lib/api";

interface PushDevice {
  id: number;
  device_label: string;
  user_agent: string;
  created_at: string | null;
  updated_at: string | null;
}

function deviceIcon(ua: string) {
  const lower = (ua || "").toLowerCase();
  if (/ipad|tablet/i.test(lower)) return <Tablet className="size-5" />;
  if (/iphone|android|mobile/i.test(lower)) return <Smartphone className="size-5" />;
  return <Monitor className="size-5" />;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CO", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return iso;
  }
}

interface PushDeviceManagerProps {
  /** Si se pasa, el componente mostrará opciones para silenciar estos canales. */
  showSilencingOptions?: boolean;
}

export default function PushDeviceManager({ showSilencingOptions = true }: PushDeviceManagerProps) {
  const { token, user, refreshUser } = useSession();
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState("");
  const savedSilenceEmail = Boolean(user?.silenciar_email_si_push);
  const savedSilenceWhatsapp = Boolean(user?.silenciar_whatsapp_si_push);
  const [silenceEmail, setSilenceEmail] = useState(savedSilenceEmail);
  const [silenceWhatsapp, setSilenceWhatsapp] = useState(savedSilenceWhatsapp);
  const [savingSilence, setSavingSilence] = useState(false);
  const [silenceNotice, setSilenceNotice] = useState("");

  const loadDevices = useCallback(async () => {
    if (!token) return;
    try {
      const result: PushDevice[] = await fetchApi("/api/chat/push/dispositivos", { token });
      setDevices(result);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los dispositivos.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  // Reinicia los interruptores cuando cambian los valores guardados del usuario,
  // durante el render y sin el render extra de un efecto.
  const savedSilenceKey = user ? `${user.id}:${savedSilenceEmail}:${savedSilenceWhatsapp}` : null;
  const [syncedSilenceKey, setSyncedSilenceKey] = useState(savedSilenceKey);
  if (savedSilenceKey !== null && syncedSilenceKey !== savedSilenceKey) {
    setSyncedSilenceKey(savedSilenceKey);
    setSilenceEmail(savedSilenceEmail);
    setSilenceWhatsapp(savedSilenceWhatsapp);
  }

  async function removeDevice(id: number) {
    if (!token) return;
    setDeleting(id);
    setError("");
    try {
      await apiRequest(`/api/chat/push/dispositivos/${id}`, { method: "DELETE", token });
      setDevices((current) => current.filter((d) => d.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el dispositivo.");
    } finally {
      setDeleting(null);
    }
  }

  async function saveSilencingPreferences() {
    if (!token) return;
    setSavingSilence(true);
    setSilenceNotice("");
    setError("");
    try {
      await apiRequest("/api/auth/preferencias-notificaciones", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          silenciar_email_si_push: silenceEmail,
          silenciar_whatsapp_si_push: silenceWhatsapp,
        }),
      });
      await refreshUser();
      setSilenceNotice("Preferencias de silenciamiento guardadas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron guardar las preferencias.");
    } finally {
      setSavingSilence(false);
    }
  }

  const hasDevices = devices.length > 0;

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 text-[var(--primary)]" />
        <div>
          <h3 className="font-semibold text-[var(--foreground)]">Notificaciones Push</h3>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            Dispositivos en los que recibes notificaciones de actuaciones y mensajes directamente en el navegador.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3 text-sm text-[var(--danger)]">{error}</p>
      )}
      {silenceNotice && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">{silenceNotice}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-[var(--foreground-muted)]">
          <Loader2 className="size-4 animate-spin" /> Cargando dispositivos…
        </div>
      ) : !hasDevices ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--foreground-muted)]">
          No tienes dispositivos con notificaciones Push activadas. Cuando el panel te pregunte si deseas activarlas, acepta para recibir avisos en ese dispositivo.
        </div>
      ) : (
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)]">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 bg-[var(--surface)] p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                {deviceIcon(device.user_agent)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--foreground)]">{device.device_label || "Dispositivo"}</p>
                <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                  Registrado {formatDate(device.created_at)} · Último uso {formatDate(device.updated_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeDevice(device.id)}
                disabled={deleting === device.id}
                aria-label={`Eliminar ${device.device_label || "dispositivo"}`}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30"
              >
                {deleting === device.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {showSilencingOptions && hasDevices && (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
          <p className="text-sm font-medium text-[var(--foreground)]">
            Cuando tienes Push activo en al menos un dispositivo:
          </p>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--foreground-muted)]">
            <input
              type="checkbox"
              checked={silenceEmail}
              onChange={(e) => setSilenceEmail(e.target.checked)}
            />
            No enviar notificaciones por correo electrónico
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--foreground-muted)]">
            <input
              type="checkbox"
              checked={silenceWhatsapp}
              onChange={(e) => setSilenceWhatsapp(e.target.checked)}
            />
            No enviar notificaciones por WhatsApp
          </label>
          <button
            type="button"
            onClick={() => void saveSilencingPreferences()}
            disabled={savingSilence}
            className="mt-1 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium !text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {savingSilence ? "Guardando…" : "Guardar preferencia"}
          </button>
        </div>
      )}
    </section>
  );
}

