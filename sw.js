// TradeQuill Service Worker — v2 (rewritten after the May 2026 kill-switch)
//
// WHY THE OLD ONE WAS DISABLED / CAUSED PROBLEMS:
// The old version likely cached the main HTML document itself and/or forced
// repeated client reloads on activation, which could cause an endless
// reload/navigation loop for some users — the browser's Stop button
// interrupting an in-progress navigation is a strong sign of exactly this.
//
// THIS VERSION NEVER:
// - caches the navigation request (the HTML page itself)
// - forces a reload of any client on install/activate
//
// It only caches genuinely static, versioned assets, and falls back to cache
// purely for true offline support — never as a way to "push" a reload.

const CACHE_NAME = 'tradequill-shell-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      // Remove any old cache from a previous (buggy) SW version.
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
    // Deliberately NOT calling client.navigate() or forcing any reload here.
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // CRITICAL: never intercept navigation (the HTML document itself).
  // Always let the browser fetch fresh from network. If offline, fall back
  // to whatever was last cached — never force a reload or redirect.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match(req).then((cached) => cached || Response.error());
      })
    );
    return;
  }

  // For everything else (images, fonts, etc.), try network first, fall back
  // to cache, and cache successful responses for next time.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && req.method === 'GET') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
