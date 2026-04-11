/**

- linea — sw.js (Service Worker)
- Cache-first for app assets, passthrough for API calls.
  */

const CACHE = ‘linea-v2’;

const ASSETS = [
‘/linea/’,
‘/linea/index.html’,
‘/linea/css/styles.css’,
‘/linea/js/app.js’,
‘/linea/manifest.json’,
‘/linea/icons/icon-192.png’,
‘/linea/icons/icon-512.png’,
‘/linea/icons/favicon.svg’,
];

self.addEventListener(‘install’, (event) => {
event.waitUntil(
caches.open(CACHE).then(cache => cache.addAll(ASSETS))
);
self.skipWaiting();
});

self.addEventListener(‘activate’, (event) => {
event.waitUntil(
caches.keys().then(keys =>
Promise.all(
keys.filter(k => k !== CACHE).map(k => caches.delete(k))
)
)
);
self.clients.claim();
});

self.addEventListener(‘fetch’, (event) => {
const url = event.request.url;

if (
url.includes(‘googleapis.com’) ||
url.includes(‘accounts.google.com’) ||
url.includes(‘apis.google.com’)
) {
return;
}

event.respondWith(
caches.match(event.request).then(cached => {
if (cached) return cached;
return fetch(event.request).then(response => {
if (event.request.method === ‘GET’ && response.status === 200) {
const clone = response.clone();
caches.open(CACHE).then(cache => cache.put(event.request, clone));
}
return response;
});
})
);
});
