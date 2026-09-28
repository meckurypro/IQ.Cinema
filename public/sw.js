/* public/sw.js
 *
 * Offline shell for IQ Cinema's in-app Downloads. The videos themselves live
 * in IndexedDB (see lib/offline); this worker only makes sure the *app* can
 * open without a connection:
 *   - /downloads and /downloads/play are cached (network-first, so online users
 *     always get the latest deploy) along with the hashed /_next/static assets
 *     they need.
 *   - Any other page requested while offline redirects to /downloads.
 * Nothing account-specific (wallet, profile, watch pages, API/Supabase calls)
 * is ever cached here.
 */

const VERSION = "iq-offline-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_ROUTES = ["/downloads", "/downloads/play"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(OFFLINE_ROUTES.map((r) => cacheRoute(r).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Stores a route's HTML and every /_next/static asset it references.
async function cacheRoute(url) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const shell = await caches.open(SHELL_CACHE);
  await shell.put(url, res);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || []);
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all([...assets].map((a) => statics.add(a).catch(() => {})));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets never change for a given URL: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode !== "navigate") return;

  if (OFFLINE_ROUTES.includes(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(url.pathname, copy));
            // Keep the asset cache in step with the latest deploy.
            cacheRoute(url.pathname).catch(() => {});
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || Response.error())
    );
    return;
  }

  // Any other page while offline: land on Downloads instead of a browser error.
  event.respondWith(
    fetch(req).catch(async () => {
      const cached = await caches.match("/downloads");
      return cached ? Response.redirect("/downloads", 302) : Response.error();
    })
  );
});
