/* Cellier Service Worker for Push Notifications */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Cellier", body: "Nouvelle notification" };
  event.waitUntil(
    self.registration.showNotification(data.title || "Cellier", {
      body: data.body,
      icon: "/manifest.json",
      badge: "/manifest.json",
      tag: data.tag || "cellier-notif",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url || "/"));
});
