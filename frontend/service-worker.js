// ── Orbit — Service Worker ────────────────────
const CACHE_NAME = 'orbit-v1';

const CACHE_FILES = [
  '/',
  '/index.html',
  '/css/theme.css',
  '/css/style.css',
  '/css/components.css',
  '/js/store.js',
  '/js/router.js',
  '/js/api.js',
  '/js/websocket.js',
  '/js/app.js',
  '/manifest.json',
];

// Kurulum — dosyaları cache'e al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_FILES))
  );
  self.skipWaiting();
});

// Aktifleşme — eski cache'leri sil
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache-first strateji
self.addEventListener('fetch', (event) => {
  // API isteklerini cache'leme
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // WS bağlantılarını geç
  if (event.request.url.includes('/ws')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static dosyalar — cache'ten sun, arka planda güncelle
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// Push bildirimleri
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Orbit', {
      body: data.body || 'Yeni mesaj',
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      data: data,
    })
  );
});

// Bildirime tıklanınca uygulamayı aç
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});