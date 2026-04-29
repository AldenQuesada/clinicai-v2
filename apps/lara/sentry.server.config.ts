/**
 * Sentry · server config (Node runtime · Server Actions, Route Handlers,
 * RSC, middleware Node-target).
 *
 * Fail-soft: sem `SENTRY_DSN`, log warn e sai sem inicializar · app
 * continua bootando (decisao Camada 11a). Captura erros server-side em
 * prod · unhandled rejections + exception cathch automatico via Next 16
 * instrumentation hooks.
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN

if (!DSN) {
  // eslint-disable-next-line no-console
  console.warn('[sentry] SENTRY_DSN ausente · Sentry desabilitado (server)')
} else {
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    debug: false,
  })
}
