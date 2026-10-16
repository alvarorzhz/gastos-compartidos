/*
 * Service worker de Gastos compartidos.
 *
 * - Guarda la app en el móvil para que se abra sin conexión (los datos se guardan aparte,
 *   en la propia app). Las páginas se piden siempre primero a internet, así que las
 *   versiones nuevas llegan solas; solo sin conexión se usa la copia.
 * - Recibe los avisos (push) y los enseña; al tocarlos abre la app.
 */

const CACHE = 'gastos-app-v1';

// Al instalarse guarda ya la página y sus archivos, para que la próxima vez se abra sin conexión.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const response = await fetch('/', { cache: 'no-cache' });
        if (!response.ok) return;
        const html = await response.clone().text();
        await cache.put('/', response);
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll([...new Set(assets)]);
      } catch {
        // Sin conexión al instalar: se guardará en la próxima visita.
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('gastos-app-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Solo lo de la propia web: los datos (Supabase) nunca se guardan aquí.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put('/', response.clone());
          }
          return response;
        } catch {
          return (await caches.match('/', { ignoreVary: true })) || Response.error();
        }
      })(),
    );
    return;
  }

  // Archivos con nombre que cambia en cada versión (assets/) y el lector de tickets: se
  // guardan la primera vez y luego se sirven del móvil.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/ocr/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request, { ignoreVary: true });
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Gastos compartidos', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gastos compartidos', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
