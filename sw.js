/* Service worker — Suite BTP
   - Cœur de l'appli pré-caché à l'installation : fonctionne hors ligne dès la 1re visite.
   - pdf.js pré-chargé si le réseau le permet (mesure sur plan PDF hors ligne).
   - Pages de l'appli : cache d'abord, mise à jour en arrière-plan (active au prochain lancement).
   - Polices et bibliothèques externes : cache d'abord, réseau en secours. */
const VERSION = 'suite-btp-v4.1.0';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
const OPTIONAL = [PDFJS + 'pdf.min.js', PDFJS + 'pdf.worker.min.js'];
const EXTERNAL_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    await Promise.all(OPTIONAL.map(url =>
      fetch(url, { mode: 'cors' }).then(r => (r.ok ? cache.put(url, r) : null)).catch(() => null)
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const cacheable = r => r && (r.ok || r.type === 'opaque');

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true })
        || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
      const network = fetch(req).then(r => { if (cacheable(r)) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const r = await network;
      return r || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }

  if (EXTERNAL_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const r = await fetch(req);
        if (cacheable(r)) cache.put(req, r.clone());
        return r;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
  }
});
