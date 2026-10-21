// Service worker: makes the app work offline after the first visit.
// Bump CACHE when you change app code (JS/CSS/HTML) so phones pick it up.
// timetable.json and rooms.json are fetched network-first, so data edits arrive without a bump.
const CACHE = "boi2026-v2";
const CORE = [
  "./", "index.html", "manifest.webmanifest",
  "styles.css",
  "app.js", "store.js", "search.js", "ics.js", "util.js", "lucky.js",
  "timetable.json", "rooms.json",
  "floorplan.jpg",
  "icon-192.png", "icon-512.png", "apple-touch-icon.png"
];
const OPTIONAL = ["fuse.min.js"];           // cached if you added it
const FUSE_CDN = "https://cdn.jsdelivr.net/";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !req.url.startsWith(FUSE_CDN)) return;

  if (sameOrigin && url.pathname.endsWith(".json")) {          // network first for data
    e.respondWith(networkFirst(req));
  } else {                                                      // cache first, refresh quietly
    e.respondWith(staleWhileRevalidate(req));
  }
});

async function put(req, res) {
  if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  try { return await put(req, await fetch(req)); }
  catch { return (await caches.match(req, { ignoreSearch: true })) || Response.error(); }
}
async function staleWhileRevalidate(req) {
  const hit = await caches.match(req, { ignoreSearch: true });
  const net = fetch(req).then((r) => put(req, r)).catch(() => null);
  if (hit) return hit;
  const res = await net;
  if (res) return res;
  if (req.mode === "navigate") return (await caches.match("index.html")) || Response.error();
  return Response.error();
}
