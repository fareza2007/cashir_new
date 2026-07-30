// Service Worker Cashirqu
// Versi dinaikkan setiap ada update agar cache lama otomatis terhapus
const CACHE_VERSION = 'cashirqu-v4';

// Hanya file statis lokal yang di-cache
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg'
  // app.js sengaja TIDAK di-cache agar selalu fresh dari server
];

// Domain yang tidak boleh di-cache (selalu ambil dari jaringan)
const NETWORK_ONLY_DOMAINS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'google.com',
  'emailjs.com',
  'cdn.jsdelivr.net', // Firebase SDK CDN
  'cdnjs.cloudflare.com'
];

// ===== INSTALL: simpan asset statis ke cache =====
self.addEventListener('install', event => {
  // Langsung aktif tanpa menunggu tab lama tutup
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('[SW] Gagal cache beberapa aset:', err);
      });
    })
  );
});

// ===== ACTIVATE: hapus cache versi lama =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION)
          .map(name => {
            console.log('[SW] Hapus cache lama:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Ambil kontrol semua tab segera
  );
});

// ===== FETCH: strategi caching yang aman =====
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Hanya tangani GET
  if (event.request.method !== 'GET') return;

  // Semua domain eksternal/Firebase: langsung ke jaringan, JANGAN cache
  const isNetworkOnly = NETWORK_ONLY_DOMAINS.some(domain => url.includes(domain));
  if (isNetworkOnly) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Request chrome-extension atau non-http: abaikan
  if (!url.startsWith('http')) return;

  // app.js: selalu ambil dari jaringan dulu, cache sebagai backup
  if (url.includes('app.js')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // Fallback ke cache jika offline
    );
    return;
  }

  // Asset statis lainnya: cache dulu, jaringan sebagai backup
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then(response => {
        // Simpan ke cache untuk kunjungan berikutnya
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      });
    }).catch(() => {
      // Jika semua gagal dan ini adalah navigasi, kembalikan index.html
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
