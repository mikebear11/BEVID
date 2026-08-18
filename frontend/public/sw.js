/* BEVID Service Worker — Push + offline shell + API cache (NetworkFirst).
   Version bump obligatoire pour purger les anciennes caches. */
const CACHE_VERSION = "bevid-v2";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    // best-effort — ne pas planter l'install si un asset optionnel manque
    await Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isApiGet(url, method) {
  return method === "GET" && url.pathname.startsWith("/api/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navigation → NetworkFirst avec repli sur index.html mis en cache
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(APP_SHELL_CACHE);
        cache.put("/index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match("/index.html") || await cache.match("/");
        return cached || new Response(
          "<h1>Hors-ligne</h1><p>Recharge quand la connexion revient.</p>",
          { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }
    })());
    return;
  }

  // 2) API GET → NetworkFirst avec cache de repli
  if (isApiGet(url, req.method)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(API_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const cache = await caches.open(API_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        return new Response(JSON.stringify({ offline: true, detail: "Offline — no cached response" }), {
          status: 503, headers: { "Content-Type": "application/json" },
        });
      }
    })());
    return;
  }

  // 3) Autres GET même origine → CacheFirst
  if (url.origin === self.location.origin && req.method === "GET") {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return cached || new Response("", { status: 504 });
      }
    })());
    return;
  }
});

/* ============ Push notifications (existant conservé) ============ */
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "BEVID", body: "Nouvelle notification" };
  event.waitUntil(
    self.registration.showNotification(data.title || "BEVID", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "bevid-notif",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data.url || "/"));
});
