/* Guarda la web en la tablet para que cargue aunque no haya internet al encenderla.
   Los archivos propios se piden primero a la red (para recibir actualizaciones) y, si falla, se sirven de la copia. */
var CACHE = 'estacion-20261114185218';
var SHELL = ['./', 'index.html', 'style.css?v=20261114185218', 'app.js?v=20261114185218', 'config.js?v=20261114185218', 'manifest.json',
  'leaflet/leaflet.js', 'leaflet/leaflet.css', 'icons/icon-192.png',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2',
  'fonts/space-grotesk-latin-500-normal.woff2', 'fonts/space-grotesk-latin-600-normal.woff2'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) { return; }
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: req.url.indexOf('.json') >= 0 }).then(function (r) { return r || caches.match('index.html'); });
    })
  );
});
