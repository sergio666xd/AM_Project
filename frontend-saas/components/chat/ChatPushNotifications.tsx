"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function ChatPushNotifications() {
  const { token } = useSession();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
        const registration = await navigator.serviceWorker.register("/chat-sw.js");
        const subscription = await registration.pushManager.getSubscription();
        if (subscription && !cancelled) await persistSubscription(subscription);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => { cancelled = true; };
  }, [persistSubscription, token]);

  async function enable() {
    if (!token || busy || permission === "unsupported") return;
    setBusy(true);
    setError("");
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
      const registration = await navigator.serviceWorker.register("/chat-sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(publicKey) as BufferSource,
      });
      await persistSubscription(subscription);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron activar las notificaciones del navegador.");
    } finally {
      setBusy(false);
    }
  }

  if (permission === "unsupported") return null;
  return <span className="inline-flex min-w-0 items-center gap-2">
    <button type="button" onClick={() => void enable()} disabled={busy || enabled || permission === "denied"}
      title={enabled ? "Notificaciones del navegador activadas" : "Activar notificaciones del navegador"}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-hover disabled:cursor-default disabled:opacity-60">
      {busy ? <Loader2 className="size-4 animate-spin" /> : enabled ? <BellRing className="size-4 text-emerald-600" /> : <Bell className="size-4" />}
      <span className="hidden sm:inline">{enabled ? "Notificaciones activadas" : "Activar notificaciones"}</span>
    </button>
    {error && <span role="status" className="max-w-48 text-[10px] text-danger">{error}</span>}
  </span>;
}
