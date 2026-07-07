// Kith service worker — shell precache + cache-first static with background
// revalidation. API responses are NEVER cached (privacy): /api/* is a pure
// network pass-through.
//
// Deploys MUST bump VERSION so old caches are purged on activate.
const VERSION = 'v2';
const CACHE = `kith-${VERSION}`;

const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/css/style.css',
  '/js/app.js',
  '/js/api.js',
  '/js/utils.js',
  '/js/icons.js',
  '/js/components.js',
  '/js/pages.js',
  '/js/contacts.js',
  '/js/groups.js',
  '/js/events.js',
  '/js/media.js',
  '/js/spicy.js',
  '/js/dashboard.js',
  '/js/settings.js',
  '/js/import.js',
  '/js/map.js',
  '/js/calendarpage.js',
  '/js/journal.js',
  '/js/trashpage.js',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
  '/vendor/leaflet/images/layers.png',
  '/vendor/leaflet/images/layers-2x.png',
  '/fonts/InterVariable.woff2',
  '/fonts/InterVariable-Italic.woff2',
  '/assets/logo.svg',
  '/assets/logo.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // partial precache failure must not block install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kith-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // /api/* — network only, never cached (privacy). No offline fallback.
  if (url.pathname.startsWith('/api/')) return;

  // Same-origin static: cache-first with background revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503, statusText: 'Offline' }));
      return cached || network;
    })
  );
});
