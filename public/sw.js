// Offline support for the home-screen app.
// - The page itself (line-up data is inlined in it) is network-first, so every online launch picks up the latest deploy,
//   and the last good copy is served when there is no network.
// - Artist photos, fonts and the source line-up pages are cached as they load, and the page asks us to fetch any photo
//   it hasn't shown yet, so the whole line-up has artwork offline.
// - /api (accounts, chat, crowd counts) always goes to the network; the page keeps its own copy of your bookings.
const VERSION = "v3"; // bump to refresh the cached app shell (v2: new site icon, v3: stone-face hero)
const SHELL = "tml-shell-" + VERSION;
const MEDIA = "tml-media";      // photos + fonts: kept across versions, they rarely change
const SOURCE = "tml-source";    // line-up pages from the original site (photo + YouTube lists)
const SHELL_FILES = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png", "/icons/favicon-16.png", "/icons/maskable-512.png", "/favicon.ico", "/privacy.html", "/sky3d.js", "/hero/face.webp", "/hero/face-depth.png"];
const PHOTO_HOST = "tomorrowland.aiko.dev";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const NAV_TIMEOUT = 4000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("tml-shell-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.startsWith("/api/avatar/")) return e.respondWith(cacheFirst(req, MEDIA));
    if (url.pathname.startsWith("/api/")) return; // live data: network only
    if (req.mode === "navigate") return e.respondWith(page(req, e));
    return e.respondWith(staleWhileRevalidate(req, SHELL, e));
  }
  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, MEDIA));
  if (url.hostname === PHOTO_HOST) {
    if (req.destination === "image" || /\.(jpe?g|png|webp|avif|gif)$/i.test(url.pathname)) return e.respondWith(photo(req));
    return e.respondWith(networkFirst(req, SOURCE));
  }
  // YouTube and anything else: straight to the network.
});

// Page: try the network (so an online launch gets the newest line-up), fall back to the saved copy.
async function page(req, e) {
  const cache = await caches.open(SHELL);
  const isPrivacy = new URL(req.url).pathname === "/privacy.html";
  const key = isPrivacy ? "/privacy.html" : "/";
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT);
    if (res.ok) e.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch {
    return (await cache.match(key)) || (await cache.match("/")) || new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req, name, e) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

// Photos: fetched with CORS (the source site allows it) so the cache stores a real, size-accurate copy.
async function photo(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  return fetchPhoto(req.url, cache);
}
async function fetchPhoto(url, cache) {
  let res;
  try { res = await fetch(url, { mode: "cors", credentials: "omit" }); }
  catch { res = await fetch(url, { mode: "no-cors" }); }
  if (res.ok || res.type === "opaque") await cache.put(url, res.clone());
  return res;
}

function withTimeout(p, ms) {
  return new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error("timeout")), ms); p.then(v => { clearTimeout(t); ok(v); }, err => { clearTimeout(t); fail(err); }); });
}

// The page sends every photo URL once it knows them, so photos you haven't scrolled to are still there offline.
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "warm-photos" && Array.isArray(d.urls)) e.waitUntil(warm(d.urls));
});
async function warm(urls) {
  const cache = await caches.open(MEDIA);
  const todo = [];
  for (const u of new Set(urls)) {
    try { if (new URL(u).hostname === PHOTO_HOST && !(await cache.match(u))) todo.push(u); } catch {}
  }
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(u => fetchPhoto(u, cache).catch(() => {})));
  const done = todo.length;
  for (const c of await self.clients.matchAll()) c.postMessage({ type: "photos-warmed", fetched: done });
}
