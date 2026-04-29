/**
 * Sentry · client config (browser bundle).
 *
 * Fail-soft: sem `NEXT_PUBLIC_SENTRY_DSN` no environment, log warn e
 * SAI sem inicializar · app continua funcional sem error tracking
 * (decisao deliberada da Camada 11a · evita travar bootstrap em deploys
 * que ainda nao plugaram DSN). Em prod com DSN, captura JS errors +
 * unhandled promise rejections do client RSC/SSR/CSR.
 *
 * Sample rates conservadores · Mira ainda esta em ramp · sem performance
 * tracing por default (custo + barulho fora do happy path).
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN

if (!DSN) {
  // eslint-disable-next-line no-console
  console.warn('[sentry] NEXT_PUBLIC_SENTRY_DSN ausente · Sentry desabilitado (client)')
} else {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  })
}
