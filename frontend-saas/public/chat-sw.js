/* Service worker for Web Push notifications.
 * Compatible with Chrome, Firefox, Edge, Safari (iOS 16.4+), Samsung Internet.
 */

/* eslint-env serviceworker */
/* global self, clients */

self.addEventListener("install", () => {
  // Tomar control inmediatamente sin esperar a que se cierre la pestaña anterior.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Reclamar todos los clientes para que el SW esté activo de inmediato.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "Tienes un mensaje nuevo." };
  }

  const title = payload.title || "Nuevo mensaje";
  const options = {
    body: payload.body || "Tienes un mensaje nuevo en el panel.",
    icon: payload.icon || "/am_rounded.png",
    badge: payload.badge || "/am_rounded.png",
    tag: payload.tag || "panel-notification",
    data: { url: payload.url || "/" },
    // Vibración para dispositivos móviles
    vibrate: [200, 100, 200],
    // Mantener la notificación visible hasta que el usuario interactúe
    requireInteraction: false,
    // Agrupar notificaciones del mismo tag (reemplaza la anterior)
    renotify: true,
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    confirmDelivery(payload.ack),
  ]));
});

// Avisa a la API que el mensaje llegó al dispositivo; así el remitente lo ve como entregado.
async function confirmDelivery(ack) {
  if (!ack || !ack.url || !ack.firma) return;
  const apiBase = new URL(self.location.href).searchParams.get("api") || self.location.origin;
  try {
    await fetch(new URL(ack.url, apiBase).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario_id: ack.usuario_id, mensaje_id: ack.mensaje_id, firma: ack.firma }),
      keepalive: true,
    });
  } catch {
    // Sin red: el mensaje se marcará como entregado cuando el usuario abra el chat.
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil((async () => {
    // Buscar una ventana existente del mismo origen
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Primero intentar encontrar una ventana con la misma URL
    for (const client of windows) {
      if (client.url === target && "focus" in client) return client.focus();
    }

    // Luego intentar navegar una ventana existente del mismo origen
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if (!("navigate" in client)) continue;
      const navigatedClient = await client.navigate(target);
      if (navigatedClient && "focus" in navigatedClient) return navigatedClient.focus();
    }

    // Si no hay ventanas, abrir una nueva
    return self.clients.openWindow(target);
  })());
});

// Manejar el cierre de notificaciones (para analytics futuros)
self.addEventListener("notificationclose", () => {
  // No-op: reservado para telemetría futura.
});
