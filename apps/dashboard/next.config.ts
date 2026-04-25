/**
 * Next.js config · @clinicai/dashboard.
 * Espelho do apps/lara · ver next.config.ts da Lara pra explicação completa.
 */

import type { NextConfig } from 'next'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co'

const csp = [
  `default-src 'self' ${SUPABASE_URL}`,
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_URL.replace('https://', '')} https://api.anthropic.com`,
  `img-src 'self' data: blob: https:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: [
    '@clinicai/ui',
    '@clinicai/utils',
    '@clinicai/supabase',
    '@clinicai/ai',
    '@clinicai/logger',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oqboitkpcvuaudouwvkl.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
