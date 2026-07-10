// Kith service worker — shell precache + cache-first static with background
// revalidation. API responses are NEVER cached (privacy): /api/* is a pure
// network pass-through.
//
// Deploys MUST bump VERSION so old caches are purged on activate.
const VERSION = 'v21';
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
  '/js/inline-edit.js',
  '/js/phonefmt.js',
  '/js/groups.js',
  '/js/events.js',
  '/js/interactions.js',
  '/js/search-index.js',
  '/js/media.js',
  '/js/spicy.js',
  '/js/dashboard.js',
  '/js/settings.js',
  '/js/import.js',
  '/js/familytree.js',
  '/js/map.js',
  '/js/calendarpage.js',
  '/js/journal.js',
  '/js/timelinepage.js',
  '/js/trashpage.js',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/minisearch/minisearch.js',
  '/vendor/d3/d3.min.js',
  '/vendor/family-chart/family-chart.min.js',
  '/vendor/family-chart/family-chart.css',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
  '/vendor/leaflet/images/layers.png',
  '/vendor/leaflet/images/layers-2x.png',
  '/fonts/record-fonts.css',
  '/fonts/newsreader-normal-400-700-latin.woff2',
  '/fonts/newsreader-normal-400-700-latin-ext.woff2',
  '/fonts/newsreader-italic-400-700-latin.woff2',
  '/fonts/newsreader-italic-400-700-latin-ext.woff2',
  '/fonts/plexsans-normal-400-latin.woff2',
  '/fonts/plexsans-normal-400-latin-ext.woff2',
  '/fonts/plexsans-normal-500-latin.woff2',
  '/fonts/plexsans-normal-500-latin-ext.woff2',
  '/fonts/plexsans-normal-600-latin.woff2',
  '/fonts/plexsans-normal-600-latin-ext.woff2',
  '/fonts/plexmono-normal-400-latin.woff2',
  '/fonts/plexmono-normal-400-latin-ext.woff2',
  '/fonts/plexmono-normal-500-latin.woff2',
  '/fonts/plexmono-normal-500-latin-ext.woff2',
  '/fonts/plexmono-normal-600-latin.woff2',
  '/fonts/plexmono-normal-600-latin-ext.woff2',
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

// Allow the page to activate a waiting worker immediately (settings.js enable
// flow posts this so the push handler in the new SW goes live before subscribe).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
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

// ------------------------------------------------------------- push
// Server sends JSON: { title, body, url }. Falls back gracefully if the
// payload is plain text or absent.
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch { data = { body: event.data.text() }; }
  }
  const title = data.title || 'Kith';
  const options = {
    body: data.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focus an existing client at the target url, or open a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && target) client.navigate(target).catch(() => {});
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
