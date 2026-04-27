import type { NextConfig } from 'next'

/**
 * Flipbook Tool · Next.js 16 (Turbopack default).
 * - Standalone build pra container Easypanel
 * - Headers de segurança · CSP estrita, HSTS, Permissions-Policy, etc
 * - Worker pdfjs bundled local (sem dep CDN)
 * - PWA-ready: viewport meta + manifest em /manifest.json
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'

const CSP = [
  "default-src 'self'",
  // Next dev/prod requer 'unsafe-eval' pro Turbopack/HMR · em prod stripping recomendado
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `connect-src 'self' ${SUPABASE_URL.replace(/\/$/, '')} ${SUPABASE_URL.replace('https://', 'wss://').replace(/\/$/, '')}`,
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self' blob:",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
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

  // Pacotes nativos/binários que Turbopack/webpack não devem tentar bundlear server-side
  serverExternalPackages: ['canvas', 'pdfjs-dist'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
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
