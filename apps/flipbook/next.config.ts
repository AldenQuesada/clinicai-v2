import type { NextConfig } from 'next'

/**
 * Flipbook Tool · Next.js 16 (Turbopack default).
 * - Standalone build pra container Easypanel
 * - Headers estáticos de segurança (HSTS, X-Frame, etc) aqui;
 *   CSP estrita com nonce por request vive em middleware.ts
 * - Worker pdfjs bundled local (sem dep CDN)
 * - PWA-ready: viewport meta + manifest em /manifest.json
 */

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Brotli/gzip nas responses (-30% bytes na transmissão)
  compress: true,
  // Remove header X-Powered-By: Next.js (sem motivo pra anunciar versão)
  poweredByHeader: false,

  // Pacotes nativos/binários que Turbopack/webpack não devem tentar bundlear server-side
  serverExternalPackages: ['canvas', 'pdfjs-dist'],

  // Tree-shake icons individuais (lucide-react import default expõe TODOS os ícones)
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
      preventFullImport: true,
    },
  },

  // Imports otimizados (Next sabe quais pacotes têm tree-shaking ruim e ajuda)
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', '@supabase/ssr'],
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
    // Cache de imagem otimizada por 1 ano (default Next é 60s)
    minimumCacheTTL: 31536000,
    // Formats modernos: AVIF antes de WebP antes de JPEG
    formats: ['image/avif', 'image/webp'],
  },

  turbopack: {},

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // pdfjs worker · cache agressivo (immutable)
      {
        source: '/pdfjs/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

export default nextConfig
