const CACHE_NAME = 'blink-shell-v7';
const APP_SHELL = ['/', '/index.html', '/logo.svg', '/favicon.svg'];

self.addEventListener('message', event => {
  if (event.data?.type === 'BLINK_CLEAR_APP_CACHE') {
    event.waitUntil(caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('blink-shell-')).map(key => caches.delete(key))
    )));
  }
});

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('blink-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith(
    (isNavigation
      ? fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', copy)).catch(() => {});
        }
        return response;
      }).catch(() => caches.match('/index.html'))
      : caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        // Hashed Vite assets are immutable; cache successful responses only.
        if (response.ok && requestUrl.pathname.startsWith('/assets/')) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      }))
    )
  );
});
