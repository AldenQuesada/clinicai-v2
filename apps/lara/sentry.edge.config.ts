/**
 * Sentry · edge config (middleware/route handlers em runtime 'edge').
 *
 * Fail-soft: sem `SENTRY_DSN`, log warn e sai sem inicializar. Edge tem
 * APIs limitadas (sem fs/Node net) entao Sentry usa transport via fetch
 * direto · subset menor de integrations.
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN

if (!DSN) {
  // eslint-disable-next-line no-console
  console.warn('[sentry] SENTRY_DSN ausente · Sentry desabilitado (edge)')
} else {
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    debug: false,
  })
}
