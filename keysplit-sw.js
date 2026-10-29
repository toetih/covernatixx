// KeySplit service worker: makes keysplit.html work offline.
// Registered with scope "/keysplit", so it never touches the rest of the site.

const CACHE = 'keysplit-v1';
const APP_SHELL = [
  './keysplit.html',
  './keysplit.webmanifest',
  './images/keysplit-icon-180.png',
  './images/keysplit-icon-192.png',
  './images/keysplit-icon-512.png',
  './images/keysplit-icon-maskable-512.png',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('keysplit-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putInCache(request, response) {
  if (response && (response.ok || response.type === 'opaque')) {
    const copy = response.clone();
    caches.open(CACHE).then(c => c.put(request, copy));
  }
  return response;
}

// App files: network first, so updates arrive as soon as there is a connection;
// fall back to the cache when offline or when the network hangs (e.g. bad venue Wi-Fi).
function networkFirst(request) {
  const fromCache = () => caches.match(request, { ignoreSearch: true }).then(hit =>
    hit || (request.mode === 'navigate' ? caches.match('./keysplit.html') : undefined));
  return new Promise(resolve => {
    let settled = false;
    const settle = response => { if (!settled && response) { settled = true; resolve(response); } };
    const timer = setTimeout(() => fromCache().then(settle), NETWORK_TIMEOUT_MS);
    fetch(request)
      .then(response => { clearTimeout(timer); settle(putInCache(request, response)); })
      .catch(() => { clearTimeout(timer); fromCache().then(hit => settle(hit || Response.error())); });
  });
}

// Fonts never change for a given URL: cache first.
function cacheFirst(request) {
  return caches.match(request).then(hit => hit || fetch(request).then(response => putInCache(request, response)));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) event.respondWith(networkFirst(request));
  else if (FONT_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(request));
});
