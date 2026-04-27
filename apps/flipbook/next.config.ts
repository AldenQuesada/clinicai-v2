import type { NextConfig } from 'next'

/**
 * Flipbook Tool · Next.js 16 (Turbopack default).
 * - Standalone build pra container Easypanel
 * - PWA-ready: viewport meta + manifest em /manifest.json
 * - Mantém porta 3333 (histórica)
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.supabase.in' },
    ],
  },

  // Turbopack config explícito (silencia warning); pdfjs roda fine sem alias customizado
  turbopack: {},
}

export default nextConfig
