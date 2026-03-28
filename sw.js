// ─── OSA TRADING JOURNAL — SERVICE WORKER ────────────────────────────────────
// Caches all assets on install so the app works fully offline.

const CACHE_NAME = 'osa-journal-v1';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@300;400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js'
];

// ─── INSTALL: cache all core assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[OSA SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[OSA SW] Caching assets');
      // Cache local assets strictly, external CDN assets with fallback
      const localAssets = ASSETS_TO_CACHE.filter(url => !url.startsWith('http'));
      const externalAssets = ASSETS_TO_CACHE.filter(url => url.startsWith('http'));

      return cache.addAll(localAssets).then(() => {
        // Cache external assets individually so one failure doesn't block install
        return Promise.allSettled(
          externalAssets.map(url =>
            cache.add(url).catch(err => console.warn('[OSA SW] Could not cache:', url, err))
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[OSA SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[OSA SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── FETCH: Cache-first strategy ─────────────────────────────────────────────
// Serve from cache if available, fall back to network, cache new responses.
self.addEventListener('fetch', (event) => {
  // Skip non-GET and browser extension requests
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {}); // Ignore network errors when we have cache

        return cachedResponse;
      }

      // Not in cache — fetch from network and cache the result
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Offline fallback — return the main app shell
        return caches.match('/index.html');
      });
    })
  );
});

// ─── MESSAGE: force update ────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
