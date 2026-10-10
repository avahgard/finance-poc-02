// Cache only public PWA files. Never cache or transmit encrypted records.
const CACHE = 'finance-poc-02-static-v1';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./db.js','./crypto.js',
  './manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('finance-poc-02-') && name !== CACHE).map(name => caches.delete(name)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const found = await cache.match(event.request);
    if (found) return found;
    if (event.request.mode === 'navigate') {
      const home = await cache.match('./index.html');
      if (home) return home;
    }
    return fetch(event.request);
  })());
});
