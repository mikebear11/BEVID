/* BEVID Service Worker v3 — offline shell + NetworkFirst pour tous les assets versionnés.

   Correctifs critiques par rapport à v2 :
   - Le CACHE_VERSION versionne toutes les caches. Tout changement de version purge intégralement les anciennes.
   - JS/CSS de l'app passent en NetworkFirst : plus jamais de bundle périmé servi indéfiniment.
   - Icônes et manifest restent en CacheFirst (rarement modifiés).
   - Plus de `skipWaiting()` automatique : la mise à jour attend un `postMessage("SKIP_WAITING")` déclenché
     par un clic explicite de l'utilisateur, pour ne pas interrompre une saisie en cours.

   Bump manuel : incrémenter CACHE_VERSION à chaque changement de contrat cache (rules ci-dessous).
*/
const CACHE_VERSION = "bevid-v3";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;   // JS/CSS (NetworkFirst)
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`; // Icônes, manifest, images (CacheFirst)

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
    await Promise.all(APP_SHELL.map(u => cache.add(u).catch(() => {})));
    // NB : pas de skipWaiting() ici. C'est le client qui décide via postMessage.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Purge intégrale : tout ce qui ne commence pas par la version courante disparaît.
    await Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isApiGet(url, method) {
  return method === "GET" && url.pathname.startsWith("/api/");
}

function isVersionedStatic(url) {
  // JS/CSS de l'app CRA — même URL peut changer de contenu en dev (bundle.js).
  return url.origin === self.location.origin &&
         (url.pathname.startsWith("/static/js/") ||
          url.pathname.startsWith("/static/css/") ||
          url.pathname.endsWith(".js") ||
          url.pathname.endsWith(".css"));
}

function isImmutableAsset(url) {
  return url.origin === self.location.origin &&
         (/\.(png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname) ||
          url.pathname === "/manifest.json");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Navigation → NetworkFirst avec repli sur index.html
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

  // 3) JS/CSS de l'app → NetworkFirst (fix bundle périmé)
  if (req.method === "GET" && isVersionedStatic(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await cache.match(req);
        return cached || new Response("", { status: 504 });
      }
    })());
    return;
  }

  // 4) Icônes / manifest / polices → CacheFirst
  if (req.method === "GET" && isImmutableAsset(url)) {
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

  // 5) Reste (POST, cross-origin, etc.) → passthrough réseau
});

/* ============ Push notifications ============ */
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
