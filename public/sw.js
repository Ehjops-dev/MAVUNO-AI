/* MavunoAI service worker — makes the app shell genuinely offline-capable.
   Strategy — network-first with a cache fallback, for both the app shell and
   API GETs. Online you always get the current build and live data; offline the
   shell still boots and shows the last known dashboard, prices and score.

   Cache-first would shave a few milliseconds but serves the *previous* build
   on the first load after every deploy — during a demo that means editing a
   file, reloading, and seeing no change. Not worth it.

   POSTs and cross-origin requests (fonts) go straight to the network.
   Bump CACHE_VERSION to invalidate old caches on deploy. */
'use strict';

const CACHE_VERSION = 'mavuno-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const DATA_CACHE = `${CACHE_VERSION}-data`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/manifest.webmanifest',
  '/img/farmer-tablet-maize.jpg',
  '/img/greenhouse-sensors.jpg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // fonts etc. — let them fail gracefully

  if (url.pathname.startsWith('/api/')) {
    // Never cache auth or health: a stale session response is worse than none.
    if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/health') return;
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  event.respondWith(networkFirst(request, SHELL_CACHE, '/index.html'));
});

async function networkFirst(request, cacheName, offlineFallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      // Let the UI know this is last-known data, not live.
      const headers = new Headers(cached.headers);
      headers.set('X-Mavuno-Offline', '1');
      return new Response(await cached.blob(), { status: cached.status, headers });
    }
    // A navigation request with nothing cached still gets the app shell.
    if (offlineFallback) {
      const shell = await cache.match(offlineFallback);
      if (shell) return shell;
    }
    throw err;
  }
}
