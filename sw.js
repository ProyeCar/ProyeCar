// build: 2026-07-15-analisis-comparativo-sin-limite-tiempo
const APP_VERSION = '1.5.133';
const CACHE_NAME = 'cardique-v' + APP_VERSION;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function esNavegacionPrincipal(request) {
  if (request.mode === 'navigate') return true;
  try {
    var url = new URL(request.url);
    return url.pathname.endsWith('index.html') || url.pathname.endsWith('/');
  } catch (e) {
    return request.url.includes('index.html');
  }
}

self.addEventListener('fetch', e => {
  var req = e.request;
  var url = req.url || '';

  // version.json e index.html: siempre red primero, sin re-cachear en cada visita
  if (url.includes('version.json') || esNavegacionPrincipal(req)) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).catch(function() {
        return caches.match(req);
      })
    );
    return;
  }

  // sw.js: nunca desde caché del SW
  if (url.includes('sw.js')) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  e.respondWith(
    caches.match(req).then(function(cached) {
      return cached || fetch(req);
    })
  );
});
