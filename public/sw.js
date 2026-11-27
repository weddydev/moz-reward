// @ts-check
/// <reference lib="webworker" />
/**
 * Moz Rewards service worker (P1-14 skeleton; P5-02 extends this same file and URL, P3-07 adds push).
 *
 * It does exactly two things (security design check 26 Nov, H1/H2):
 *  1. The offline member card: it keeps the public offline shell (`/offline`, fetched signed out, so the cached
 *     HTML holds no account data) with the `/_next/static/` files that page names, and the last response of
 *     `GET /api/me/member-qr` (one entry; the card payload: token, member ID, first name).
 *     The manifest and its two icons are kept with the shell (public files a browser asks for offline too).
 *  2. When a page navigation fails because there is no network, it answers with that shell.
 * Nothing else is cached or intercepted: only same-origin GETs are looked at, never a POST (server actions,
 * forms), and an HTTP error or redirect from the network always passes through untouched.
 *
 * Kill switch (RUNBOOK §19): replace this file with the self-unregistering version there and deploy.
 */
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const SHELL_CACHE = "moz-shell-v1";
const CARD_CACHE = "moz-card-token";
const CARD_URL = "/api/me/member-qr";
const OFFLINE_URL = "/offline";
/** The time (phone clock, ms) a cached card response arrived; the card counts the token's 5 minutes from it. */
const RECEIVED = "x-moz-received-at";
/** The shell is re-fetched at most this often when a card asks (every card mount posts "refresh-shell"). */
const SHELL_REFRESH_MS = 10 * 60_000;
const KEEP = new Set([SHELL_CACHE, CARD_CACHE]);
const MANIFEST_FILES = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

/** Bumped by "signed-out": a card fetch that began before it never writes the cache (design check H1). */
let generation = 0;
let shellFetchedAt = 0;
/**
 * Set when a navigation fails for lack of network, cleared when one succeeds. Static files are intercepted only
 * while the network is down (this, or the browser says offline): online they never pass through the worker, so
 * a worker update can't cut a file's load (WebKit closes the old worker's in-flight fetches).
 */
let networkDown = false;

sw.addEventListener("install", (/** @type {ExtendableEvent} */ event) => {
  event.waitUntil(refreshShell().catch(() => undefined));
  void sw.skipWaiting();
});

sw.addEventListener("activate", (/** @type {ExtendableEvent} */ event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.has(name)) await caches.delete(name);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (/** @type {ExtendableMessageEvent} */ event) => {
  const type = event.data && event.data.type;
  const reply = () => event.ports[0] && event.ports[0].postMessage({ ok: true });
  if (type === "signed-out") {
    generation += 1;
    event.waitUntil(caches.delete(CARD_CACHE).then(reply, reply));
  } else if (type === "refresh-shell") {
    if (Date.now() - shellFetchedAt > SHELL_REFRESH_MS) {
      event.waitUntil(refreshShell().catch(() => undefined));
    }
  }
});

sw.addEventListener("fetch", (/** @type {FetchEvent} */ event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;
  if (url.pathname === CARD_URL) {
    event.respondWith(cardResponse(req));
  } else if (req.mode === "navigate") {
    event.respondWith(navigate(req));
  } else if (url.pathname.startsWith("/_next/static/") || MANIFEST_FILES.includes(url.pathname)) {
    if (networkDown || !sw.navigator.onLine) event.respondWith(staticAsset(req));
  }
});

/** The offline shell and the static files it names; files the new shell no longer names are dropped. */
async function refreshShell() {
  shellFetchedAt = Date.now();
  const res = await fetch(OFFLINE_URL, { credentials: "omit", cache: "no-store" });
  if (!res.ok || res.redirected) return;
  const html = await res.clone().text();
  const assets = new Set();
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    assets.add(m[1].replace(/&amp;/g, "&"));
  }
  // The manifest and its icons: public, and a browser asks for them offline too.
  for (const path of MANIFEST_FILES) assets.add(path);
  const cache = await caches.open(SHELL_CACHE);
  const store = async (/** @type {string} */ path) => {
    const hit = await cache.match(path);
    if (hit) return hit;
    const a = await fetch(path, { credentials: "omit" });
    if (!a.ok) return null;
    await cache.put(path, a.clone());
    return a;
  };
  const files = await Promise.all([...assets].map(async (path) => [path, await store(path)]));
  // Fonts and images the shell's stylesheets name (next/font files are named only in the CSS).
  const named = new Set();
  for (const [path, res] of files) {
    if (!res || !String(path).endsWith(".css")) continue;
    const css = await res.clone().text();
    // Next writes them relative to the stylesheet (`url(../media/x.woff2)`): resolve against its URL.
    for (const m of css.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
      const abs = new URL(m[1], new URL(String(path), sw.location.origin));
      if (abs.origin === sw.location.origin && abs.pathname.startsWith("/_next/static/media/")) {
        named.add(abs.pathname);
      }
    }
  }
  for (const path of named) assets.add(path);
  await Promise.all([...named].map((path) => store(path)));
  await cache.put(OFFLINE_URL, res);
  for (const key of await cache.keys()) {
    const path = new URL(key.url).pathname + new URL(key.url).search;
    if (path !== OFFLINE_URL && !assets.has(path)) await cache.delete(key);
  }
}

/** Network first; only a network failure falls back to the offline shell. */
async function navigate(/** @type {Request} */ req) {
  try {
    const res = await fetch(req);
    networkDown = false;
    return res;
  } catch (err) {
    networkDown = true;
    const shell = await caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE });
    if (shell) return shell;
    throw err;
  }
}

/** While the network is down: network first, the shell's own files from the cache when it fails. */
async function staticAsset(/** @type {Request} */ req) {
  try {
    return await fetch(req);
  } catch (err) {
    const url = new URL(req.url);
    const hit = await caches.match(url.pathname + url.search, { cacheName: SHELL_CACHE });
    if (hit) return hit;
    throw err;
  }
}

/** The card payload: network first, one cached copy for when there is no network. */
async function cardResponse(/** @type {Request} */ req) {
  const startedIn = generation;
  /** @type {Response} */
  let res;
  try {
    res = await fetch(req);
  } catch {
    return (await cachedCard({ freshTokenOnly: false })) || offline();
  }
  if (res.status === 200) {
    if (startedIn === generation) {
      const copy = await stamped(res.clone());
      if (startedIn === generation) await (await caches.open(CARD_CACHE)).put(CARD_URL, copy);
    }
    return res;
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    await caches.delete(CARD_CACHE);
    return res;
  }
  // Rate limited or a server error: the cached copy only while its token is still good; never deleted.
  if (res.status === 429 || res.status >= 500) {
    return (await cachedCard({ freshTokenOnly: true })) || res;
  }
  return res;
}

/** The response with every original header (CSP, nosniff, no-store) plus the time it arrived. */
async function stamped(/** @type {Response} */ res) {
  const headers = new Headers(res.headers);
  headers.set(RECEIVED, String(Date.now()));
  return new Response(await res.arrayBuffer(), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * The cached card, or null. Dropped (and deleted) once older than its `cacheUntil` (a day), or when the phone's
 * clock is behind the time it arrived. `freshTokenOnly`: only while the token itself is unexpired.
 */
async function cachedCard(/** @type {{ freshTokenOnly: boolean }} */ { freshTokenOnly }) {
  const cache = await caches.open(CARD_CACHE);
  const hit = await cache.match(CARD_URL);
  if (!hit) return null;
  try {
    const received = Number(hit.headers.get(RECEIVED));
    const body = await hit.clone().json();
    const age = Date.now() - received;
    const keep = body.cacheUntil - body.serverNow;
    if (!Number.isFinite(received) || age < 0 || !(age < keep)) {
      await caches.delete(CARD_CACHE);
      return null;
    }
    if (freshTokenOnly && !(age < body.expiresAt - body.serverNow)) return null;
    return hit;
  } catch {
    await caches.delete(CARD_CACHE);
    return null;
  }
}

function offline() {
  return new Response(JSON.stringify({ error: { code: "OFFLINE", message: "You're offline." } }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
