const CACHE_NAME = 'antigravity-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell and Assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing Old Cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests and local origin calls
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Do not intercept Appwrite API calls, socket connections or file uploads
  if (e.request.url.includes('/v1/') || e.request.url.includes('/socket.io/') || e.request.url.includes('/api/')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((networkResponse) => {
        // Cache dynamic assets if the response is valid
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        const acceptHeader = e.request.headers.get('accept') || '';
        if (acceptHeader.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Handle background push notifications (calls and messages)
self.addEventListener('push', (e) => {
  if (!e.data) return;

  try {
    const payload = e.data.json();
    console.log('[Service Worker] Push Received:', payload);

    const title = payload.title || 'Antigravity Chat';
    const options = {
      body: payload.body || '',
      icon: '/icons/icon-192.png',
      badge: '/favicon.svg',
      data: payload,
      vibrate: [200, 100, 200, 100, 200, 100, 200],
      tag: payload.type === 'incoming_call' ? 'antigravity-call' : 'antigravity-message',
      renotify: true,
    };

    if (payload.type === 'incoming_call') {
      options.requireInteraction = true;
      options.actions = [
        { action: 'answer', title: 'Answer' },
        { action: 'decline', title: 'Decline' }
      ];
    }

    e.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (err) {
    console.error('[Service Worker] Error parsing push event data:', err);
    
    e.waitUntil(
      self.registration.showNotification('New notification', {
        body: e.data.text(),
        icon: '/icons/icon-192.png',
        badge: '/favicon.svg',
      })
    );
  }
});

// Handle notification click: focus or open app window
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  
  const payload = e.notification.data;
  const action = e.action;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      let targetUrl = '/';
      if (payload && payload.type === 'incoming_call' && action === 'answer') {
        const callerTag = payload.data.caller_tag;
        const offer = payload.data.offer;
        targetUrl = `/?action=answer&caller=${callerTag}&offer=${encodeURIComponent(JSON.stringify(offer))}`;
      }

      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        
        if (targetUrl !== '/') {
          client.navigate(targetUrl);
        }
        return client.focus();
      }
      
      return self.clients.openWindow(targetUrl);
    })
  );
});

