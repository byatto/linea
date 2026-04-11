/**

- linea — sw.js (Service Worker)
- Network-first for app pages/scripts (so updates always come through).
- Cache-first for static assets (icons, manifest).
- Passthrough for Google API calls.
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
// Cache assets individually — don’t let one missing file block installation
event.waitUntil(
caches.open(CACHE).then(cache =>
Promise.allSettled(
ASSETS.map(url =>
cache.add(url).catch(err => console.warn(‘SW: could not cache’, url, err))
)
)
)
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

// Never cache Google API/auth calls
if (
url.includes(‘googleapis.com’) ||
url.includes(‘accounts.google.com’) ||
url.includes(‘apis.google.com’)
) {
return;
}

// For HTML, CSS, JS — use network-first so updates always come through
// Falls back to cache if offline
if (
url.endsWith(’.html’) || url.endsWith(’.css’) || url.endsWith(’.js’) ||
url.endsWith(’/linea/’) || url.endsWith(’/linea’)
) {
event.respondWith(
fetch(event.request)
.then(response => {
if (response.status === 200) {
const clone = response.clone();
caches.open(CACHE).then(cache => cache.put(event.request, clone));
}
return response;
})
.catch(() => caches.match(event.request))
);
return;
}

// For everything else (icons, manifest) — cache-first
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
