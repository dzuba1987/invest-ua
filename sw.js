const CACHE_NAME = 'invest-calc-v120';
const ASSETS = [
  './',
  './index.html',
  './help.html',
  './admin.html',
  './styles.css',
  './app.js',
  './i18n.js',
  './config.js',
  './changelog-seed.js',
  './changelog.js',
  './manifest.json',
  './modules/firebase.js',
  './modules/telegram.js',
  './modules/form-drafts.js',
  './modules/ui-dialog.js',
  './icon-192.png',
  './icon-512.png',
  './icon.svg'
];

self.addEventListener('install', e => {
  // Bypass the browser HTTP cache when pre-caching assets on install,
  // otherwise a stale file still in the browser's cache gets frozen into
  // the new SW cache and served forever by the fetch handler's cache fallback.
  e.waitUntil(caches.open(CACHE_NAME).then(c =>
    Promise.all(ASSETS.map(a =>
      fetch(new Request(a, { cache: 'reload' })).then(r => c.put(a, r.clone()))
    ))
  ));
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
  // App files — network first (bypass HTTP cache so a stale response doesn't
  // get persisted into the SW cache), fallback to cache when offline.
  e.respondWith(
    fetch(new Request(e.request.url, { cache: 'no-cache' })).then(response => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return response;
    }).catch(() => caches.match(e.request))
  );
});
