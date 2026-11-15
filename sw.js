// Service worker: guarda la app para que abra rápido y sin internet.
// Las páginas se piden primero a la red (para recibir siempre la última versión);
// el resto de archivos sale de la caché y se actualiza en segundo plano.
const VERSION = 'creatina-v2.1.1';
const ARCHIVOS = [
  './', './index.html', './css/estilos.css',
  './js/app.js', './js/almacen.js', './js/registro.js', './js/firebase-config.js',
  './manifest.webmanifest', './img/icono.svg', './img/icono-192.png', './img/icono-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const propio = url.origin === location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!propio && !firebaseSdk) return;   // Firestore y Google Sign-In van siempre a la red

  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  evento.respondWith(
    caches.match(request).then((enCache) => {
      const deRed = fetch(request).then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copia));
        }
        return respuesta;
      });
      return enCache || deRed;
    }),
  );
});
