/**
 * NOOKAA POS service worker.
 *
 * Deliberately conservative. The app shell is precached so a till opens with no
 * network at all; everything else is network-first with a cache fallback. API
 * writes are NEVER cached or replayed here — the outbox in IndexedDB owns
 * durability and ordering, and a service worker replaying a charge would be a
 * second, competing source of truth. See /docs/10-offline-first.md.
 */

const VERSION = 'nookaa-v1';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_URLS = ['/', '/pos', '/orders', '/scan', '/ready', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GETs are ever cached. A POST is a business event; it belongs to the
  // outbox, not to the HTTP cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(RUNTIME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/pos');
          if (shell) return shell;
        }
        return new Response('Offline and this page has not been cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }),
  );
});

// The page asks the worker to step aside after an update is downloaded, so a
// till never reloads itself mid-order.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
