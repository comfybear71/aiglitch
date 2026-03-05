// AIG!itch Service Worker — Cache feed responses and static assets for instant repeat loads
const CACHE_NAME = "aiglitch-v1";
const FEED_CACHE = "aiglitch-feed-v1";
const MEDIA_CACHE = "aiglitch-media-v1";

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/aiglitch.jpg",
  "/manifest.json",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== FEED_CACHE && key !== MEDIA_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: route-based caching strategies
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Strategy 1: Feed API — stale-while-revalidate
  // Serve cached feed instantly, update cache in background
  if (url.pathname === "/api/feed") {
    event.respondWith(staleWhileRevalidate(event.request, FEED_CACHE, 120));
    return;
  }

  // Strategy 2: Trending API — stale-while-revalidate (longer TTL)
  if (url.pathname === "/api/trending") {
    event.respondWith(staleWhileRevalidate(event.request, FEED_CACHE, 300));
    return;
  }

  // Strategy 3: Blob storage media — cache-first (immutable content)
  if (
    url.hostname.includes("blob.vercel-storage.com") ||
    url.hostname === "images.pexels.com" ||
    url.hostname === "replicate.delivery"
  ) {
    event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
    return;
  }

  // Strategy 4: Intro videos — cache-first
  if (url.pathname.startsWith("/intros/")) {
    event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
    return;
  }

  // Strategy 5: Static image assets — cache-first
  if (url.pathname.match(/\.(jpg|jpeg|png|webp|avif|gif|svg)$/)) {
    event.respondWith(cacheFirst(event.request, CACHE_NAME));
    return;
  }
});

// Stale-while-revalidate: serve cached response immediately, fetch fresh copy in background
async function staleWhileRevalidate(request, cacheName, maxAgeSec) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  // Fetch fresh copy in background (don't await)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        // Store with timestamp for TTL enforcement
        const cloned = response.clone();
        const headers = new Headers(cloned.headers);
        headers.set("sw-cached-at", Date.now().toString());
        const cachedResp = new Response(cloned.body, {
          status: cloned.status,
          statusText: cloned.statusText,
          headers,
        });
        cache.put(request, cachedResp);
      }
      return response;
    })
    .catch(() => cachedResponse); // If network fails, fall back to cache

  if (cachedResponse) {
    // Check if cached response is within TTL
    const cachedAt = parseInt(cachedResponse.headers.get("sw-cached-at") || "0");
    const age = (Date.now() - cachedAt) / 1000;
    if (age < maxAgeSec) {
      // Serve from cache, update in background
      fetchPromise; // fire-and-forget
      return cachedResponse;
    }
  }

  // No valid cache — wait for network
  return fetchPromise;
}

// Cache-first: serve from cache if available, otherwise fetch and cache
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}
