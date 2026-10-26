"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { API_URL, apiRequest } from "@/lib/api";

// El service worker confirma la entrega de los push contra la API, que puede vivir en otro origen.
const SERVICE_WORKER_URL = API_URL ? `/chat-sw.js?api=${encodeURIComponent(API_URL)}` : "/chat-sw.js";

function decodeApplicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getOrCreateSubscription(registration: ServiceWorkerRegistration, publicKey: string, setStage: (stage: string) => void) {
  const expectedKey = decodeApplicationServerKey(publicKey);
  setStage("buscar_suscripcion");
  let subscription = await registration.pushManager.getSubscription();
  const currentKey = subscription?.options.applicationServerKey;
  const currentBytes = currentKey ? new Uint8Array(currentKey) : null;
  const sameKey = !!currentBytes && currentBytes.length === expectedKey.length
    && currentBytes.every((byte, index) => byte === expectedKey[index]);
  if (subscription && currentBytes && !sameKey) {
    setStage("eliminar_suscripcion_anterior");
    await subscription.unsubscribe();
    subscription = null;
  }
  if (subscription) return subscription;

  setStage("crear_suscripcion");
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKey as BufferSource,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const transientPushFailure = cause instanceof DOMException
        && (cause.name === "AbortError" || /push service error/i.test(message));
      if (!transientPushFailure || attempt >= 2) throw cause;
      await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();

  let os = "Dispositivo";
  if (/iphone/i.test(ua)) os = "iPhone";
  else if (/ipad/i.test(ua)) os = "iPad";
  else if (/android/i.test(ua)) os = "Android";
  else if (/macintosh|mac os/i.test(ua)) os = "Mac";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "";
  if (/edg\//i.test(ua) || /edga\//i.test(ua) || /edgios\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && /safari\//i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua) || /fxios\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome/i.test(uaLower)) browser = "Safari";
  else if (/samsungbrowser/i.test(ua)) browser = "Samsung Internet";

  return browser ? `${os} · ${browser}` : os;
}

async function reportPushFailure(token: string, stage: string, cause: unknown) {
  const name = cause instanceof Error ? cause.name : "Error";
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error("Error al configurar las notificaciones Push", { stage, name, message });
  try {
    await apiRequest("/api/chat/push/diagnosticos", {
      method: "POST",
      token,
      body: JSON.stringify({ etapa: stage, nombre_error: name.slice(0, 120), mensaje_error: message.slice(0, 500) }),
    });
  } catch (diagnosticError) {
    console.warn("No se pudo enviar el diagnóstico Push a la API", diagnosticError);
  }
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
    const subJson = subscription.toJSON();
    await apiRequest("/api/chat/push/suscripciones", {
      method: "POST",
      token,
      body: JSON.stringify({
        ...subJson,
        user_agent: navigator.userAgent || "",
        device_label: getDeviceLabel(),
      }),
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
    let stage = "clave_publica";
    if (currentPermission !== "granted") setOpen(!dismissed);

    void (async () => {
      try {
        if (currentPermission === "granted") {
          const keyResponse = await apiRequest("/api/chat/push/clave-publica", { token });
          const { public_key: publicKey } = await keyResponse.json() as { public_key: string };
          stage = "registrar_service_worker";
          await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
          stage = "esperar_service_worker";
          const registration = await navigator.serviceWorker.ready;
          const subscription = await getOrCreateSubscription(registration, publicKey, (value) => { stage = value; });
          stage = "guardar_suscripcion";
          if (!cancelled) await persistSubscription(subscription);
        }
      } catch (cause) {
        await reportPushFailure(token, stage, cause);
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
    let stage = "clave_publica";
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
      stage = "registrar_service_worker";
      await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
      stage = "esperar_service_worker";
      const registration = await navigator.serviceWorker.ready;
      const subscription = await getOrCreateSubscription(registration, publicKey, (value) => { stage = value; });
      stage = "guardar_suscripcion";
      await persistSubscription(subscription);
    } catch (cause) {
      await reportPushFailure(token, stage, cause);
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
