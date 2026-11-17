/* Prekilo · Service Worker
   Cachea la app para que funcione sin internet y recibe las notificaciones push. */
const VERSION = 'prekilo-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nunca cachear la API
  if (url.hostname.includes('base44.app')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        fetch(req).then((r) => { if (r && r.ok) caches.open(VERSION).then((c) => c.put(req, r)); }).catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((r) => {
          if (r && r.ok && url.origin === location.origin) {
            const copy = r.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return r;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});

/* ---------- Push ---------- */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Prekilo';
  const body = data.body || 'Revisa tu saldo de energía.';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'prekilo',
      renotify: true,
      vibrate: data.tag === 'prekilo-alerta' ? [200, 100, 200] : [80],
      data: { url: data.url || './', saldo: data.saldo ?? null }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('/prekilo/') && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

/* Sincronización de fondo: si el sistema la concede, refresca el saldo del día */
self.addEventListener('sync', (e) => {
  if (e.tag !== 'prekilo-sync') return;
  e.waitUntil(
    fetch('https://ca-68f01a11.base44.app/functions/prekiloApi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' })
    }).catch(() => {})
  );
});
