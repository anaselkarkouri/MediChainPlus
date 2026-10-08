/* MediChain+ — Service Worker v3
 * Stratégie :
 *  - HTML / navigation : NETWORK-FIRST (pour ne plus être bloqué par un cache obsolète).
 *  - Assets statiques (CSS, JS, manifest) : stale-while-revalidate.
 *  - Routes API du backend (/api/*, /health) : ZÉRO cache.
 */
const CACHE = "medichain-front-v3";
const PRECACHE = ["./styles.css", "./app.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname === "/health" ||
    url.host.includes("cdn.jsdelivr") ||
    url.host.includes("cdnjs.cloudflare") ||
    url.host.includes("fonts.googleapis") ||
    url.host.includes("fonts.gstatic")
  );
}

function isHtml(req, url) {
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  return /\.html?$/.test(url.pathname) || url.pathname === "/";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Ne jamais intercepter le backend ni les CDN dynamiques
  if (isApiRequest(url)) return;

  // Pages HTML : network-first
  if (isHtml(req, url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Assets statiques : stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
