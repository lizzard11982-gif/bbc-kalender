// Einfacher Service-Worker: App-Hülle offline verfügbar, API nie gecacht.
const V = 'bbc-app-v1';
const SHELL = ['./', 'app.css', 'app.js', '../shared/brand.css', '../shared/logo.png', '../shared/icon-192.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ch) => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
