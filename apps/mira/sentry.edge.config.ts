/**
 * Sentry · Edge runtime config (middleware, edge route handlers).
 *
 * Mira nao usa edge runtime ainda (todos handlers sao Node.js · fast ack +
 * worker), mas Next.js exige o arquivo se @sentry/nextjs esta presente. SDK
 * fica noop quando DSN ausente.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || ''
const env = process.env.NODE_ENV || 'development'

Sentry.init({
  dsn: dsn || undefined,
  environment: env,
  tracesSampleRate: env === 'production' ? 0.1 : 0,
  sendDefaultPii: false,
})
