const CACHE_NAME = 'iris-arcade-v2';
const ASSETS = [
  './',
  './index.html',
  './shared.css',
  './shared.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './games/bloom-puzzle.html',
  './games/neon-2048.html',
  './games/hex-crush.html',
  './games/snake-flux.html',
  './games/void-defense.html',
  './games/memory-matrix.html',
  './games/garden-maze.html',
  './games/flappy-petal.html',
  './games/sudoku-noir.html',
  './games/minesweeper.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok && e.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
