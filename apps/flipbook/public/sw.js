/**
 * Service Worker · Flipbook PWA
 *
 * Estratégia:
 * - Static (worker, manifest, ícones): cache-first, longo
 * - Capas (flipbook-covers): cache-first, 30 dias
 * - PDFs (signed URL): network-first (URLs expiram, não cacheia)
 * - HTML pages: network-first com fallback offline
 */
const CACHE_VERSION = 'v1'
const STATIC_CACHE = `flipbook-static-${CACHE_VERSION}`
const COVERS_CACHE = `flipbook-covers-${CACHE_VERSION}`
const PAGES_CACHE = `flipbook-pages-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/manifest.json',
  '/pdfjs/pdf.worker.min.mjs',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS).catch(() => {})),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.endsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // PDFs assinados · sempre fresco (URLs expiram)
  if (url.pathname.includes('/storage/v1/object/sign/flipbook-pdfs')) return

  // Capas · cache-first 30 dias
  if (url.pathname.includes('/storage/v1/object/public/flipbook-covers')) {
    e.respondWith(
      caches.open(COVERS_CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh.ok) cache.put(req, fresh.clone())
          return fresh
        } catch {
          return cached || Response.error()
        }
      }),
    )
    return
  }

  // Static assets bundled
  if (url.origin === self.location.origin && (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/pdfjs/') ||
    url.pathname === '/manifest.json'
  )) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          if (fresh.ok) cache.put(req, fresh.clone())
          return fresh
        } catch {
          return cached || Response.error()
        }
      }),
    )
    return
  }

  // HTML pages · network-first
  if (req.destination === 'document') {
    e.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(PAGES_CACHE)
          cache.put(req, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cached = await caches.match(req)
          return cached || new Response('<h1>Offline</h1><p>Conteúdo não disponível offline ainda.</p>', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
      })(),
    )
  }
})
