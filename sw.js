// ════════════════════════════════════════════════
// TradeQuill Service Worker — KILL SWITCH (May 2026)
// ════════════════════════════════════════════════
// This SW exists ONLY to unregister the previous broken SW
// and clear all caches. After it activates, it will
// remove itself, freeing the page from any SW interference.

const VERSION = 'kill-switch-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();

    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      console.log('[SW kill-switch] Cleared', keys.length, 'cache(s)');
    } catch (e) {
      console.warn('[SW kill-switch] Cache clear failed', e);
    }

    try {
      await self.registration.unregister();
      console.log('[SW kill-switch] Unregistered self');
    } catch (e) {
      console.warn('[SW kill-switch] Unregister failed', e);
    }

    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => { try { c.navigate(c.url); } catch (e) {} });
    } catch (e) {}
  })());
});

self.addEventListener('fetch', event => {
  // No interception — let browser handle requests normally
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
