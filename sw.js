// Velora service worker.
// Keeps the website working offline: the app's own files and the WebLLM library are stored
// after the first visit. The AI model files are stored separately by the WebLLM library in
// the browser's Cache Storage, and this worker does not touch them.
const CACHE_NAME = 'velora-v8';
const TRUSTED_CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('velora-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const trustedCDN = TRUSTED_CDN_HOSTS.includes(url.hostname);
  if (!sameOrigin && !trustedCDN) return; // model downloads and everything else go straight to the network

  event.respondWith(sameOrigin ? networkFirst(request) : cacheFirst(request));
});

// Your own files: try the network so updates arrive, fall back to the saved copy when offline.
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const saved = (await cache.match(request)) ||
      (request.mode === 'navigate' ? await cache.match(self.registration.scope) : undefined) ||
      (request.mode === 'navigate' ? await cache.match(new URL('index.html', self.registration.scope).href) : undefined);
    if (saved) return saved;
    return new Response('Velora is offline and this page has not been saved yet. Connect to the internet once, then try again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

// The WebLLM library is pinned to one version, so a saved copy never goes stale.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
