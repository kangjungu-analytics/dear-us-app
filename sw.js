const CACHE_NAME = "dear-us-shell-v3";
const APP_ROOT = new URL("./", self.location).pathname;
const INDEX_URL = new URL("./index.html", self.location).href;
const STATIC_PATHS = new Set([
  new URL("./index.html", self.location).pathname,
  new URL("./styles.css", self.location).pathname,
  new URL("./app.js", self.location).pathname,
  new URL("./favicon.svg", self.location).pathname,
  new URL("./manifest.webmanifest", self.location).pathname,
  new URL("./icons/icon-192.png", self.location).pathname,
  new URL("./icons/icon-512.png", self.location).pathname,
  new URL("./icons/apple-touch-icon.png", self.location).pathname,
]);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const paths = [
      "./", "./index.html", "./styles.css?v=20261107calendar1",
      "./app.js?v=20261107calendar1", "./favicon.svg", "./manifest.webmanifest",
      "./icons/icon-192.png", "./icons/icon-512.png",
      "./icons/apple-touch-icon.png",
    ];
    await cache.addAll(paths.map((path) =>
      new Request(new URL(path, self.location), { cache: "reload" })
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("dear-us-shell-") && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Supabase, fonts, signed photo URLs, and other external requests bypass this worker.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith(APP_ROOT)) {
    event.respondWith(fetch(request).catch(() => caches.match(INDEX_URL)));
    return;
  }

  // Only app-shell files are cached; private messages and photos are never cached.
  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
