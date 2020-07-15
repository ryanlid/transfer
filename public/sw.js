const CACHE_NAME = 'PWA';

self.addEventListener('install', (event) => {
  // 跳过等待
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      cache.addAll(['/', '404.html']);
    })
  );
});

self.addEventListener('active', () => {
  // 立即受控
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  return event.respondWith(
    fetch(event.request)
      .then((res) => {
        if ((event.request.mode === 'navigate', res.status === 404)) {
          return fetch('404.html');
        }
        return res;
      })
      .catch(() => {
        // 离线处理
        console.log('离线处理');
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((response) => {
            if (response) {
              return response;
            }
            return caches.match('404.html');
          });
        });
      })
  );
});
