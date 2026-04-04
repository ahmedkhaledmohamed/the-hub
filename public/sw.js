/**
 * The Hub — Service Worker
 *
 * Caches the app shell and recent API responses for offline-ish usage.
 * Strategy: network-first for API, cache-first for static assets.
 */

const CACHE_NAME = "hub-v1";

const SHELL_URLS = [
  "/briefing",
  "/",
];

const API_CACHE_URLS = [
  "/api/manifest",
  "/api/repos",
];

// Install: cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => {
        // Shell caching is best-effort
      })
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, stale-while-revalidate for pages
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API routes: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful GET responses for select API routes
          if (event.request.method === "GET" && response.ok) {
            const shouldCache = API_CACHE_URLS.some((p) => url.pathname.startsWith(p));
            if (shouldCache) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Pages: stale-while-revalidate
  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }
});
