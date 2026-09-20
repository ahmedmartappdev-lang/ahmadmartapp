// Ahmad Mart service worker.
//
// Kept intentionally minimal — the only reason this file exists right now is
// to enable Web Push notifications. No offline caching, no request
// interception. If you add offline support later, do it in a separate PR.

self.addEventListener('install', (event) => {
  // Activate immediately so the very first subscription request works
  // without needing a manual reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Ahmad Mart', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Ahmad Mart';
  const body = payload.body || '';
  const url = payload.url || '/orders';

  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url, ...(payload.data || {}) },
    tag: payload.tag || 'ahmad-mart',
    // Re-use / replace prior notifications with the same tag so the user
    // doesn't get a stack of duplicates for the same order.
    renotify: false,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/orders';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab on the same origin if we can, otherwise open a new one.
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin && 'focus' in client) {
            await client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        } catch { /* ignore */ }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
