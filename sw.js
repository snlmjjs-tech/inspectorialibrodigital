// Service worker mínimo. Existe solo para que el navegador ofrezca
// "Instalar app" — a propósito NO guarda nada en caché, así los inspectores
// siempre ven la última versión publicada (la página ya se actualiza sola
// con cada cambio subido a GitHub Pages; cachear aquí la dejaría obsoleta).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
