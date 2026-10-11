self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "Tienes un mensaje nuevo." };
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Nuevo mensaje", {
    body: payload.body || "Tienes un mensaje nuevo en el panel.",
    icon: "/AM_logo_Recurso%202_Landscape_web.png",
    badge: "/AM_logo_Recurso%202_Landscape_web.png",
    tag: payload.tag || "chat-message",
    data: { url: payload.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === target && "focus" in client) return client.focus();
    }
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin || !("navigate" in client)) continue;
      const navigatedClient = await client.navigate(target);
      if (navigatedClient && "focus" in navigatedClient) return navigatedClient.focus();
    }
    return self.clients.openWindow(target);
  })());
});
