/**
 * Notificaciones del navegador (Web Push).
 *
 * El service worker vive en el mismo origen que la API (rewrite de Next y de
 * Vercel), así que confirma la entrega de cada aviso sin CORS.
 */
import { api, type Esquemas } from "@/lib/api-v2/cliente";

type Etapa = Esquemas["Diagnostico"]["etapa"];

const SERVICE_WORKER = "/chat-sw.js";

export type EstadoNavegador = "sin-soporte" | NotificationPermission;

export function estadoDelNavegador(): EstadoNavegador {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "sin-soporte";
  }
  return Notification.permission;
}

function bytesDeClave(valor: string): Uint8Array {
  const relleno = "=".repeat((4 - (valor.length % 4)) % 4);
  const base64 = (valor + relleno).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (c) => c.charCodeAt(0));
}

/** Nombre corto del equipo para la lista de dispositivos: «iPhone · Safari». */
export function nombreDelDispositivo(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const sistema = /iphone/i.test(ua) ? "iPhone"
    : /ipad/i.test(ua) ? "iPad"
      : /android/i.test(ua) ? "Android"
        : /macintosh|mac os/i.test(ua) ? "Mac"
          : /windows/i.test(ua) ? "Windows"
            : /linux/i.test(ua) ? "Linux" : "Dispositivo";
  const navegador = /edg(a|ios)?\//i.test(ua) ? "Edge"
    : /samsungbrowser/i.test(ua) ? "Samsung Internet"
      : /firefox\/|fxios\//i.test(ua) ? "Firefox"
        : /chrome\/|crios\//i.test(ua) ? "Chrome"
          : /safari\//i.test(ua) ? "Safari" : "";
  return navegador ? `${sistema} · ${navegador}` : sistema;
}

class FalloPush extends Error {
  constructor(readonly etapa: Etapa, readonly causa: unknown) {
    super(causa instanceof Error ? causa.message : String(causa));
  }
}

async function enEtapa<T>(etapa: Etapa, paso: () => Promise<T>): Promise<T> {
  try {
    return await paso();
  } catch (causa) {
    throw causa instanceof FalloPush ? causa : new FalloPush(etapa, causa);
  }
}

async function suscripcion(registro: ServiceWorkerRegistration, clave: string): Promise<PushSubscription> {
  const esperada = bytesDeClave(clave);
  let actual = await enEtapa("buscar_suscripcion", () => registro.pushManager.getSubscription());
  const vigente = actual?.options.applicationServerKey;
  const bytes = vigente ? new Uint8Array(vigente) : null;
  const misma = !!bytes && bytes.length === esperada.length && bytes.every((b, i) => b === esperada[i]);
  if (actual && bytes && !misma) {
    await enEtapa("eliminar_suscripcion_anterior", () => actual!.unsubscribe());
    actual = null;
  }
  if (actual) return actual;
  return enEtapa("crear_suscripcion", async () => {
    for (let intento = 0; ; intento += 1) {
      try {
        return await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: esperada as BufferSource });
      } catch (causa) {
        const pasajero = causa instanceof DOMException && (causa.name === "AbortError" || /push service error/i.test(causa.message));
        if (!pasajero || intento >= 2) throw causa;
        await new Promise((listo) => window.setTimeout(listo, 500 * (intento + 1)));
      }
    }
  });
}

/**
 * Registra el service worker, suscribe este navegador y guarda la suscripción.
 * Requiere el permiso ya concedido. Si algo falla, avisa al servidor en qué paso.
 */
export async function suscribirEsteNavegador(): Promise<void> {
  try {
    const { data } = await enEtapa("clave_publica", async () => {
      const respuesta = await api.GET("/api/v2/push/clave-publica");
      if (!respuesta.data) throw new Error(respuesta.error?.mensaje ?? "El servidor no tiene configuradas las notificaciones.");
      return respuesta;
    });
    await enEtapa("registrar_service_worker", () => navigator.serviceWorker.register(SERVICE_WORKER, { scope: "/" }));
    const registro = await enEtapa("esperar_service_worker", () => navigator.serviceWorker.ready);
    const sub = (await suscripcion(registro, data.clave)).toJSON();
    await enEtapa("guardar_suscripcion", async () => {
      const { error } = await api.POST("/api/v2/push/suscripciones", {
        body: { endpoint: sub.endpoint ?? "", keys: sub.keys ?? {}, user_agent: navigator.userAgent.slice(0, 512), nombre: nombreDelDispositivo() },
      });
      if (error) throw new Error(error.mensaje);
    });
  } catch (causa) {
    const fallo = causa instanceof FalloPush ? causa : new FalloPush("clave_publica", causa);
    const original = fallo.causa;
    void api.POST("/api/v2/push/diagnosticos", {
      body: {
        etapa: fallo.etapa,
        nombre_error: (original instanceof Error ? original.name : "Error").slice(0, 120),
        mensaje_error: fallo.message.slice(0, 500),
      },
    });
    throw fallo;
  }
}

/** Pide el permiso al navegador (si hace falta) y suscribe. Devuelve el permiso final. */
export async function activarNotificaciones(): Promise<NotificationPermission> {
  const permiso = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permiso === "granted") await suscribirEsteNavegador();
  return permiso;
}
