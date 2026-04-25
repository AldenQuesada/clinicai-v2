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
import { withSentryConfig } from '@sentry/nextjs'

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

// Wrapping condicional · so envolve com withSentryConfig se DSN estiver setado.
// Sem DSN = noop puro (dev local nao precisa configurar nada e nao crash).
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      // Org/project sao opcionais · sem upload de sourcemaps se nao setados.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      // Silencia logs de build do Sentry CLI em prod
      silent: !process.env.CI,
      // Hide source maps client-side (PII em código nao deve vazar)
      hideSourceMaps: true,
      // Tunnel route opcional · evita ad-blockers cortando capture
      tunnelRoute: '/monitoring',
      // Disable widening (otimizacao opcional do Sentry)
      widenClientFileUpload: false,
      // Auth token so usado em build pra upload de sourcemaps
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Disable upload se auth token ausente · evita warn em deploys sem credencial
      disableServerWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
      disableClientWebpackPlugin: !process.env.SENTRY_AUTH_TOKEN,
    })
  : nextConfig

export default finalConfig
