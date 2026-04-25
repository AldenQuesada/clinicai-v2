/**
 * Next.js config · @clinicai/mira.
 *
 * Espelho do apps/lara/next.config.ts mas servindo a Mira (B2B + admin via WA).
 * Porta 3006 (Lara é 3005). standalone output pro Dockerfile minimal Easypanel.
 *
 * CSP cravada · permite chamadas Evolution + Anthropic + Groq + Supabase.
 *
 * Sentry (F6 · alert system): wrapping com `withSentryConfig` so acontece se
 * `NEXT_PUBLIC_SENTRY_DSN` estiver setado · mantem dev local funcional sem DSN
 * e evita upload de sourcemaps em build sem credentials.
 */

import type { NextConfig } from 'next'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co'
const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'https://evolution.aldenquesada.site'

const csp = [
  `default-src 'self' ${SUPABASE_URL}`,
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_URL.replace('https://', '')} https://api.anthropic.com https://api.groq.com ${EVOLUTION_URL}`,
  `img-src 'self' data: blob: https:`,
  `media-src 'self' data: blob: https:`,
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
    '@clinicai/whatsapp',
    '@clinicai/logger',
    '@clinicai/repositories',
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

// Wrapping condicional · DYNAMIC import pra evitar puxar @sentry/nextjs (e
// toda instrumentacao OpenTelemetry junto) quando DSN nao esta setado. Import
// estatico quebra o webpack cache do Next 16 (WasmHash undefined em build) ·
// dynamic require so quando DSN existe.
let finalConfig: NextConfig = nextConfig
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs') as typeof import('@sentry/nextjs')
  finalConfig = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: !process.env.CI,
    hideSourceMaps: true,
    tunnelRoute: '/monitoring',
    widenClientFileUpload: false,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
    disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
  })
}

export default finalConfig
