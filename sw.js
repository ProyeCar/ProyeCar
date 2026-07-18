// build: 2026-07-18-offline-first-precache
const APP_VERSION = '1.5.154';
const CACHE_NAME = 'cardique-v' + APP_VERSION;

/** Rutas críticas offline (relativas al scope del SW). */
const PRECACHE_URLS = [
  './',
  './index.html',
  './icons.js',
  './registro-asesoria.js',
  './supabase-pdfs.js',
  './manifest.json',
  './version.json',
  './assets/cardique-logo-registro.jpg',
  './icon-192.png',
  './icon-512.png'
];

const OFFLINE_FALLBACKS = ['./index.html', './', './?offline=1'];

const OFFLINE_HTML = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>ProyeCar sin conexión</title>'
  + '<style>body{font-family:Calibri,sans-serif;margin:0;padding:24px;background:#f8fafc;color:#111827}'
  + 'h1{font-size:1.1rem;margin:0 0 8px}p{margin:0;line-height:1.5;color:#475569}</style></head><body>'
  + '<h1>Sin conexión</h1>'
  + '<p>ProyeCar no pudo cargar este recurso. Vuelve a abrir la app instalada cuando tengas datos, '
  + 'o usa una pantalla que ya hayas visitado con conexión.</p></body></html>';

function esNavegacionPrincipal(request) {
  if (request.mode === 'navigate') return true;
  try {
    var url = new URL(request.url);
    return url.pathname.endsWith('index.html') || url.pathname.endsWith('/');
  } catch (e) {
    return (request.url || '').includes('index.html');
  }
}

function esMismoOrigen(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function offlineHtmlResponse() {
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function offlineTextResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

function asegurarResponse(response, request) {
  if (response) return response;
  if (esNavegacionPrincipal(request)) return offlineHtmlResponse();
  return offlineTextResponse();
}

async function matchAny(candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var hit = await caches.match(candidates[i]);
    if (hit) return hit;
  }
  return null;
}

async function matchNavegacion(request) {
  var direct = await caches.match(request);
  if (direct) return direct;
  return matchAny(OFFLINE_FALLBACKS);
}

async function precacheRecursos(cache) {
  await Promise.all(PRECACHE_URLS.map(function(url) {
    return cache.add(url).catch(function(err) {
      console.warn('[SW] precache omitido:', url, err && err.message ? err.message : err);
    });
  }));
}

async function cacheFirst(request) {
  var cached = await caches.match(request);
  if (cached) return cached;

  try {
    var response = await fetch(request);
    if (response && response.ok && request.method === 'GET') {
      var cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(function() {});
    }
    return asegurarResponse(response, request);
  } catch (err) {
    cached = await caches.match(request);
    if (cached) return cached;
    if (esNavegacionPrincipal(request)) {
      return (await matchNavegacion(request)) || offlineHtmlResponse();
    }
    return offlineTextResponse();
  }
}

async function networkFirstDocumento(request) {
  try {
    var response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && request.method === 'GET') {
      var cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(function() {});
      if (esNavegacionPrincipal(request)) {
        cache.put('./index.html', response.clone()).catch(function() {});
      }
    }
    return asegurarResponse(response, request);
  } catch (err) {
    var cached = await matchNavegacion(request);
    return cached || offlineHtmlResponse();
  }
}

async function networkFirstVersion(request) {
  try {
    var response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      var cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(function() {});
    }
    return asegurarResponse(response, request);
  } catch (err) {
    var cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ version: APP_VERSION }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(precacheRecursos)
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys()
      .then(function(names) {
        return Promise.all(
          names.filter(function(name) { return name !== CACHE_NAME; })
            .map(function(name) { return caches.delete(name); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = request.url || '';

  if (url.includes('sw.js')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(function() {
        return caches.match(request);
      }).then(function(response) {
        return asegurarResponse(response, request);
      })
    );
    return;
  }

  if (!esMismoOrigen(request)) {
    event.respondWith(
      fetch(request).catch(function() {
        return caches.match(request);
      }).then(function(response) {
        return response || offlineTextResponse();
      })
    );
    return;
  }

  if (url.includes('version.json')) {
    event.respondWith(networkFirstVersion(request));
    return;
  }

  if (esNavegacionPrincipal(request)) {
    event.respondWith(networkFirstDocumento(request));
    return;
  }

  event.respondWith(
    cacheFirst(request).catch(function() {
      return offlineTextResponse();
    })
  );
});
