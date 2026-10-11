"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { apiRequest } from "@/lib/api";

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

export default function PushNotificationPrompt() {
  const { token, user } = useSession();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  const persistSubscription = useCallback(async (subscription: PushSubscription) => {
    if (!token) return;
    await apiRequest("/api/chat/push/suscripciones", {
      method: "POST",
      token,
      body: JSON.stringify(subscription.toJSON()),
    });
    setOpen(false);
    setError("");
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      setSupported(false);
      setChecking(false);
      return;
    }
    setSupported(true);
    const currentPermission = Notification.permission;
    setPermission(currentPermission);
    if (!token || !user) {
      setChecking(false);
      return;
    }

    const dismissed = window.sessionStorage.getItem(`push-prompt-dismissed:${user.id}`) === "1";
    let cancelled = false;
    if (currentPermission !== "granted") setOpen(!dismissed);

    void (async () => {
      try {
        if (currentPermission === "granted") {
          const keyResponse = await apiRequest("/api/chat/push/clave-publica", { token });
          const { public_key: publicKey } = await keyResponse.json() as { public_key: string };
          await navigator.serviceWorker.register("/chat-sw.js");
          const registration = await navigator.serviceWorker.ready;
          const subscription = await getOrCreateSubscription(registration, publicKey);
          if (!cancelled) await persistSubscription(subscription);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "No se pudo configurar Push en este dispositivo.");
          if (!dismissed) setOpen(true);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [persistSubscription, token, user]);

  async function enable() {
    if (!token || busy || permission === "unsupported" || permission === "denied") return;
    setBusy(true);
    setError("");
    try {
      const granted = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        setError(granted === "denied"
          ? "El navegador bloqueó las notificaciones. Cámbialo desde los permisos del sitio en la configuración del navegador."
          : "No se concedió el permiso de notificaciones.");
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

  function dismiss() {
    if (user) window.sessionStorage.setItem(`push-prompt-dismissed:${user.id}`, "1");
    setOpen(false);
  }

  if (!supported || checking || !token || !user || !open) return null;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="push-prompt-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-foreground shadow-2xl">
      <button type="button" onClick={dismiss} aria-label="Cerrar aviso" className="float-right rounded-lg p-2 text-foreground-muted hover:bg-surface-hover"><X className="size-4" /></button>
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><BellRing className="size-6" /></span>
      <h2 id="push-prompt-title" className="mt-4 text-xl font-semibold">Activa las notificaciones del panel</h2>
      <p className="mt-2 text-sm leading-6 text-foreground-muted">Recibe avisos de mensajes y nuevas actuaciones judiciales en este dispositivo, incluso cuando el panel no esté abierto.</p>
      {permission === "denied" && !error && <p className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">El navegador bloqueó las notificaciones. Para activarlas, cambia el permiso de este sitio desde la configuración del navegador y vuelve a entrar al panel.</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={dismiss} className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-hover">Ahora no</button>
        {permission !== "denied" && <button type="button" onClick={() => void enable()} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold !text-white disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
          {busy ? "Configurando…" : "Configurar notificaciones"}
        </button>}
      </div>
    </section>
  </div>;
}
