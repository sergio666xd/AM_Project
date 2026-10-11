"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

type Props = { showTestButton?: boolean };

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getOrCreateSubscription(registration: ServiceWorkerRegistration, publicKey: string) {
  const expectedKey = decodeApplicationServerKey(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  const currentKey = subscription?.options.applicationServerKey;
  const currentBytes = currentKey ? new Uint8Array(currentKey) : null;
  const sameKey = !!currentBytes && currentBytes.length === expectedKey.length
    && currentBytes.every((byte, index) => byte === expectedKey[index]);

  if (subscription && !sameKey) {
    await subscription.unsubscribe();
    subscription = null;
  }

  return subscription ?? registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expectedKey as BufferSource,
  });
}

export default function ChatPushNotifications({ showTestButton = false }: Props) {
  const { token } = useSession();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const persistSubscription = useCallback(async (subscription: PushSubscription) => {
    if (!token) return;
    await apiRequest("/api/chat/push/suscripciones", {
      method: "POST",
      token,
      body: JSON.stringify(subscription.toJSON()),
    });
    setEnabled(true);
    setError("");
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    if (Notification.permission !== "granted" || !token) return;

    let cancelled = false;
    void (async () => {
      try {
        const keyResponse = await apiRequest("/api/chat/push/clave-publica", { token });
        const { public_key: publicKey } = await keyResponse.json() as { public_key: string };
        await navigator.serviceWorker.register("/chat-sw.js");
        const registration = await navigator.serviceWorker.ready;
        const subscription = await getOrCreateSubscription(registration, publicKey);
        if (!cancelled) await persistSubscription(subscription);
      } catch (cause) {
        if (!cancelled) {
          setEnabled(false);
          setError(cause instanceof Error ? cause.message : "No se pudo verificar la suscripcion Push.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [persistSubscription, token]);

  async function enable() {
    if (!token || busy || permission === "unsupported") return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const granted = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setError(granted === "denied" ? "El navegador bloqueó las notificaciones para este sitio." : "No se concedió el permiso de notificaciones.");
        return;
      }

      const keyResponse = await apiRequest("/api/chat/push/clave-publica", { token });
      const { public_key: publicKey } = await keyResponse.json() as { public_key: string };
      await navigator.serviceWorker.register("/chat-sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await getOrCreateSubscription(registration, publicKey);
      await persistSubscription(subscription);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron activar las notificaciones del navegador.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!token || !enabled || testing) return;
    setTesting(true);
    setError("");
    setStatus("");
    try {
      await apiRequest("/api/chat/push/prueba", { method: "POST", token });
      setStatus("Prueba enviada al servicio Push. Debe aparecer en este dispositivo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar la prueba Push.");
    } finally {
      setTesting(false);
    }
  }

  if (permission === "unsupported") return null;
  return <span className="inline-flex min-w-0 flex-wrap items-center justify-end gap-2">
    <button type="button" onClick={() => void enable()} disabled={busy || enabled || permission === "denied"}
      title={enabled ? "Notificaciones del navegador activadas" : "Activar notificaciones del navegador"}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:cursor-default disabled:opacity-60">
      {busy ? <Loader2 className="size-4 animate-spin" /> : enabled ? <BellRing className="size-4 text-emerald-600" /> : <Bell className="size-4" />}
      <span className="hidden sm:inline">{enabled ? "Notificaciones activadas" : "Activar notificaciones"}</span>
    </button>
    {showTestButton && enabled && <button type="button" onClick={() => void sendTest()} disabled={testing}
      title="Enviar una notificacion Push de prueba"
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:opacity-60">
      {testing ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
      <span>Probar</span>
    </button>}
    {error && <span role="status" className="max-w-48 text-[10px] text-danger">{error}</span>}
    {status && <span role="status" className="max-w-64 text-[10px] text-emerald-700">{status}</span>}
  </span>;
}
