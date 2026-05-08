// ════════════════════════════════════════════════
// TradeQuill Service Worker (May 2026)
// ════════════════════════════════════════════════
// Strategy:
//   - App shell (index.html, fonts, libs): Cache-first, then network
//   - Supabase API calls: Network-first (fall back to cache)
//   - Anthropic API: Network-only (always fresh)
//   - Static assets (fonts, CDN libs): Stale-while-revalidate
//
// Versioning: bump CACHE_VERSION when shipping breaking changes.
// On activate, old caches are deleted.

const CACHE_VERSION = 'tq-v2.1.0';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Resources to pre-cache on install (the "shell")
const SHELL_RESOURCES = [
  './',
  './index.html',
];

// Network-only domains (never serve from cache — always live)
const NETWORK_ONLY_DOMAINS = [
  'api.anthropic.com',
  'gaipov-rustam.workers.dev',
];

// Stale-while-revalidate domains (serve cache fast, update in background)
const SWR_DOMAINS = [
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// Network-first domains (try fresh, fall back to cache)
const NETWORK_FIRST_DOMAINS = [
  'supabase.co',
  'api.exchangerate.host',
  'api.frankfurter.app',
];

// ────────────────────────────────────────────────
// INSTALL — pre-cache the shell
// ────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_RESOURCES))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});

// ────────────────────────────────────────────────
// ACTIVATE — clean up old caches
// ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating version', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ────────────────────────────────────────────────
// FETCH — strategy router
// ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET (POST/PUT/DELETE always go to network)
  if (req.method !== 'GET') return;

  // Skip chrome-extension:// etc
  if (!url.protocol.startsWith('http')) return;

  // Network-only: live data we never want to cache
  if (NETWORK_ONLY_DOMAINS.some(d => url.hostname.includes(d))) {
    return; // browser handles natively
  }

  // Network-first: try fresh, fall back to cache
  if (NETWORK_FIRST_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Stale-while-revalidate: cache + update in background
  if (SWR_DOMAINS.some(d => url.hostname.includes(d))) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Same-origin: cache-first (the app shell)
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Default: network-first for everything else
  event.respondWith(networkFirst(req));
});

// ────────────────────────────────────────────────
// STRATEGIES
// ────────────────────────────────────────────────
async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh in background (so next load is up-to-date)
    fetch(request)
      .then(resp => {
        if (resp && resp.ok) cache.put(request, resp.clone());
      })
      .catch(() => {/* offline, ignore */});
    return cached;
  }
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    // Final offline fallback: serve index.html for navigation
    if (request.mode === 'navigate') {
      const fallback = await cache.match('./index.html') || await cache.match('./');
      if (fallback) return fallback;
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(resp => {
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  }).catch(() => cached);
  return cached || fetchPromise;
}

// ────────────────────────────────────────────────
// MESSAGE — handle commands from main thread
// ────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      keys.forEach(k => caches.delete(k));
    });
  }
});
