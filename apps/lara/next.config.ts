/**
 * Next.js config · @clinicai/lara.
 *
 * - transpilePackages: necessário pra Next.js 16 consumir TS direto dos
 *   workspace packages (sem build step intermediário). HMR funciona em dev.
 * - headers: CSP cravada (Gap 1 do MIGRATION_DOCTRINE) · espelha hardening
 *   do clinic-dashboard `_headers`/`nginx.conf` mas adaptado pra Next.
 * - output: standalone · Dockerfile minimal pro Easypanel.
 * - withSentryConfig: wrapper Camada 11a · injeta instrumentation hooks
 *   pros 3 runtimes (client/server/edge). Fail-soft se SENTRY_DSN ausente
 *   (cada sentry.*.config.ts decide se inicializa ou nao). silent +
 *   disableLogger evita poluir build logs · sem source map upload em
 *   builds locais (configurar SENTRY_AUTH_TOKEN em CI quando precisar).
 */
import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co'

const csp = [
  `default-src 'self' ${SUPABASE_URL}`,
  // 'unsafe-inline' em script-src é necessário pro Next inline boot script ·
  // mitigado por nonce em produção (TODO Fase 2).
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `connect-src 'self' ${SUPABASE_URL} wss://${SUPABASE_URL.replace('https://', '')} https://api.anthropic.com https://api.groq.com https://graph.facebook.com`,
  `img-src 'self' data: blob: https:`,
  `media-src 'self' data: blob: https:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Bug fix 2026-04-28: standalone build nao copia *.md de src/prompt/** que
  // sao lidos via fs.readFileSync em runtime (ai.service + /prompts page).
  // Sem isso, getFixedResponse retorna null e Lara cai pro Claude desde a 1a
  // mensagem · /prompts mostra "(arquivo nao encontrado)" pra layers sem
  // override no DB. Inclui em todas as rotas pra cobrir RSC + API + actions.
  outputFileTracingIncludes: {
    '/*': ['src/prompt/**/*.md'],
  },
  transpilePackages: [
    '@clinicai/ui',
    '@clinicai/utils',
    '@clinicai/supabase',
    '@clinicai/repositories',
    '@clinicai/ai',
    '@clinicai/whatsapp',
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

export default withSentryConfig(nextConfig, {
  // Silenciar logs de build · evita ruido em CI/Easypanel quando DSN ausente
  silent: true,
  disableLogger: true,
  // Source map upload precisa de SENTRY_AUTH_TOKEN · ausente = no-op
  // (Sentry SDK detecta e pula upload sem quebrar build).
})
