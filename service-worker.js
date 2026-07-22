const CACHE_NAME = 'nz-coordinate-converter-v4';
const ASSETS_TO_CACHE = [
  '.',
  'index.html',
  'script.js',
  'style.css',
  'proj4.js',
  'topo50.json',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon.svg'
];

self.addEventListener('install', event => {
  // Activate this service worker immediately once installed
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  // Take control of uncontrolled clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
