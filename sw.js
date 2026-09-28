const CACHE_NAME = "sweet-mart-admin-v10";
const APP_SHELL = [
  "/admin.html",
  "/admin-v2.js",
  "/manifest.webmanifest",
  "/sweet-mart-admin-icon.svg",
  "/sweet-mart-admin-icon-192.png",
  "/sweet-mart-admin-icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses: the dashboard has its own local/offline data layer.
  if (url.pathname.startsWith("/api/") || url.pathname === "/api") return;

  // For page navigations, use the network when available and fall back to
  // the cached dashboard shell. This makes /admin.html open offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/admin.html"))
    );
    return;
  }

  // Cache-first for the static application shell/assets.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
