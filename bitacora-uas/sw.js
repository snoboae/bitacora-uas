/* Service worker: la app funciona sin conexión.
   - Archivos de la app: caché con actualización en segundo plano.
   - Teselas de mapa: caché con límite (las que ya viste o precargaste). */
const VERSION = 'v5d8fc9a6';
const APP_CACHE = 'bv-app-' + VERSION;
const TILE_CACHE = 'bv-tiles-v1';
const MAX_TILES = 2500;

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/db.js',
  'js/geo.js',
  'js/mapimg.js',
  'js/pdf.js',
  'js/app.js',
  'lib/leaflet/leaflet.js',
  'lib/leaflet/leaflet.css',
  'lib/leaflet/images/layers.png',
  'lib/leaflet/images/layers-2x.png',
  'lib/leaflet/images/marker-icon.png',
  'lib/leaflet/images/marker-icon-2x.png',
  'lib/leaflet/images/marker-shadow.png',
  'lib/draw/leaflet.draw.js',
  'lib/draw/leaflet.draw.css',
  'lib/draw/images/spritesheet.png',
  'lib/draw/images/spritesheet-2x.png',
  'lib/draw/images/spritesheet.svg',
  'lib/jspdf/jspdf.umd.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

const TILE_HOSTS = ['server.arcgisonline.com', 'tile.openstreetmap.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bv-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const c = await caches.open(TILE_CACHE);
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    const extra = keys.length - MAX_TILES;
    for (let i = 0; i < extra; i++) await c.delete(keys[i]);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone());
          if (Math.random() < 0.02) trimTiles();
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'offline' });
      }
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { net.catch(() => {}); return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
      return Response.error();
    })());
  }
});
