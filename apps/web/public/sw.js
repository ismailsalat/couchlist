/* Couchlist keeps its service worker intentionally boring.
 *
 * Only fingerprinted/static app assets are cached. Page navigations, Next.js
 * RSC/Flight responses, authenticated HTML, and API responses always go to the
 * network. Caching those dynamic responses caused stale client/server markup
 * and hydration failures after status changes.
 */
const CACHE = 'couchlist-static-v2';
const CACHE_PREFIX = 'couchlist-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept pages, APIs, or Next.js RSC/Flight navigation responses.
  if (request.mode === 'navigate') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.searchParams.has('_rsc')) return;
  if (request.headers.get('rsc') === '1') return;
  if (request.headers.get('accept')?.includes('text/x-component')) return;

  // Fingerprinted Next assets and PWA icons are safe to cache permanently.
  const cacheable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/');
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        await cache.put(request, copy);
      }
      return response;
    }),
  );
});
