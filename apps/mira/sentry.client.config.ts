/**
 * Sentry · Browser/client config.
 *
 * Mira nao tem UI publica (e bot WA), mas Next.js exige o arquivo. SDK fica
 * noop quando DSN ausente. Configurado pra capturar erros JS de eventuais
 * paginas admin/debug futuras.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || ''
const env = process.env.NODE_ENV || 'development'

Sentry.init({
  dsn: dsn || undefined,
  environment: env,
  tracesSampleRate: env === 'production' ? 0.1 : 0,
  // Replay desligado · Mira nao tem UI publica
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  sendDefaultPii: false,
})
