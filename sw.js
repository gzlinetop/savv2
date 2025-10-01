const CACHE_NAME = 'miplayer-shell-v1';
const OFFLINE_URL = './index.html';
const ASSETS_TO_CACHE = [
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  const req = evt.request;
  const url = new URL(req.url);
  // no cache YouTube media
  if (url.hostname.includes('youtube.com') || url.hostname.includes('ytimg.com') || url.pathname.endsWith('.mp4')) {
    return;
  }
  evt.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if(req.method === 'GET' && res && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => {
      if (req.headers.get('accept')?.includes('text/html')) return caches.match(OFFLINE_URL);
    }))
  );
});

/* Notification click handler: envía mensaje al cliente con la acción */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const action = event.action; // e.g. 'play', 'pause', 'next', 'prev'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList && clientList.length > 0) {
        // manda el mensaje al primer client
        clientList[0].postMessage({ type: 'media-action', action: action || 'focus' });
        // y enfoca esa ventana
        return clientList[0].focus();
      }
      // si no hay ventana, abre la app root
      return clients.openWindow('./');
    })
  );
});

/* cuando la notificación se cierra (opcional) */
self.addEventListener('notificationclose', function(event){
  // puedes hacer limpieza si necesitas
});
