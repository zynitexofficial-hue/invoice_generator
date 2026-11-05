/*
 * Offline service worker for the static export (spec I1).
 *
 * - install:  precache the files listed in /sw-manifest.json (generated after
 *             `next build` by scripts/gen-sw-manifest.mjs, which also stamps
 *             VERSION below so each deploy ships a new worker).
 * - activate: delete caches from older versions.
 * - fetch:    same-origin GET only. Pages: network first, then the cached copy,
 *             then the cached /dashboard, then a tiny offline page.
 *             /_next/static/*: cache first (file names are content-hashed).
 *             Everything else same-origin: network first with cache fallback.
 *             Non-GET and cross-origin requests are never touched or cached.
 *
 * No data ever leaves the device: this worker only caches the app's own files.
 */
/* eslint-disable */
const VERSION = "__SW_VERSION__";
const PRECACHE = `ig-precache-${VERSION}`;
const RUNTIME = `ig-runtime-${VERSION}`;
const FALLBACK_PAGE = "/dashboard";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch(`/sw-manifest.json?v=${VERSION}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`sw-manifest.json: ${res.status}`);
      const manifest = await res.json();
      const cache = await caches.open(PRECACHE);
      const urls = Array.isArray(manifest.urls) ? manifest.urls : [];
      // Small batches keep memory and connection use modest on phones.
      for (let i = 0; i < urls.length; i += 16) {
        await Promise.all(
          urls.slice(i, i + 16).map(async (url) => {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (!response.ok) throw new Error(`precache ${url}: ${response.status}`);
            await cache.put(url, await cleanResponse(response));
          }),
        );
      }
    })(),
  );
  // The page decides when to switch (the "New version — Reload" toast) —
  // except on the very first install, when there is nothing to replace.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("ig-") && k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js" || url.pathname === "/sw-manifest.json") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request, url));
  }
});

/** Responses that followed a redirect can't be replayed for navigations; copy them. */
async function cleanResponse(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function cacheable(response) {
  return response && response.ok && response.type === "basic";
}

/** Cache key for a page: clean path without query or trailing slash (except "/"). */
function pageKey(url) {
  let p = url.pathname.replace(/\.html$/, "");
  if (p === "/index") p = "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

async function handleNavigation(request, url) {
  const key = pageKey(url);
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const copy = await cleanResponse(response.clone());
      const cache = await caches.open(RUNTIME);
      await cache.put(key, copy);
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(key)) ||
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match(FALLBACK_PAGE));
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;line-height:1.5"><h1>You are offline</h1><p>This page hasn\'t been saved for offline use yet. Connect to the internet once and open the app again — after that it works offline.</p><p>Your invoices are safe: they are stored in this browser, not online.</p></body>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (cacheable(response)) {
    const cache = await caches.open(RUNTIME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, url) {
  // RSC payloads (*.txt?_rsc=…) are static files in an export: key them without the query.
  const key = url.pathname.endsWith(".txt") ? url.pathname : request;
  try {
    const response = await fetch(request);
    if (cacheable(response)) {
      const cache = await caches.open(RUNTIME);
      await cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached =
      (await caches.match(key)) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw error;
  }
}
