const CACHE_NAME = 'invest-calc-v11';
const ASSETS = [
  './',
  './index.html',
  './help.html',
  './admin.html',
  './styles.css',
  './app.js',
  './i18n.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Only handle GET requests with http(s) scheme
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  // CDN & Firebase requests — network only
  if (e.request.url.includes('cdn.jsdelivr.net') || e.request.url.includes('gstatic.com') || e.request.url.includes('googleapis.com') || e.request.url.includes('firestore.googleapis.com')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // App files — network first, fallback to cache
  e.respondWith(
    fetch(e.request).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});
