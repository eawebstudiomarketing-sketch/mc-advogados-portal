// Service worker do portal MC: só recebe avisos (Web Push) e abre a tela certa
// ao tocar. Não guarda páginas em cache.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let dados = { titulo: "MC Advogados", corpo: "", url: "/admin/publicacoes" };
  try {
    dados = { ...dados, ...event.data.json() };
  } catch {
    if (event.data) dados.corpo = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/brand/app-192.png",
      badge: "/brand/app-192.png",
      data: { url: dados.url },
      tag: dados.tag || "publicacoes",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/publicacoes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if ("focus" in j) {
          j.navigate(url);
          return j.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
