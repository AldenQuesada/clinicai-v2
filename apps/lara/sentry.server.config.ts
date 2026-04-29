/**
 * Sentry · server config (Node runtime · Server Actions, Route Handlers,
 * RSC, middleware Node-target).
 *
 * Fail-soft: sem `SENTRY_DSN`, log warn e sai sem inicializar · app
 * continua bootando (decisao Camada 11a). Captura erros server-side em
 * prod · unhandled rejections + exception cathch automatico via Next 16
 * instrumentation hooks.
 *
 * Camada 11b · beforeSend filter:
 *   - Skip 404s e NEXT_NOT_FOUND (uso esperado de notFound() em RSC)
 *   - Skip AbortError (cliente fechou conexao mid-request, nao e bug)
 *   - Skip Postgres "no rows" (PGRST116) · ja tratado como retorno null
 *   - Skip RpcError 'forbidden' / 'invalid_input' (validacao normal,
 *     ja propagado pra UI · so polui dashboard)
 */
import * as Sentry from '@sentry/nextjs'

const DSN = process.env.SENTRY_DSN

const NOISE_PATTERNS = [
  /NEXT_NOT_FOUND/,
  /NEXT_REDIRECT/,
  /AbortError/i,
  /PGRST116/,
  /User aborted a request/i,
]

const NOISE_ERROR_CODES = new Set(['forbidden', 'invalid_input', 'not_found'])

if (!DSN) {
  // eslint-disable-next-line no-console
  console.warn('[sentry] SENTRY_DSN ausente · Sentry desabilitado (server)')
} else {
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    debug: false,
    beforeSend(event, hint) {
      const err = hint?.originalException
      const message =
        (err instanceof Error ? err.message : String(err ?? '')) ||
        event.message ||
        ''

      // Filtra ruido conhecido
      if (NOISE_PATTERNS.some((rx) => rx.test(message))) return null

      // Filtra Result<T,E>.fail mapeados (validacao normal, nao sao bugs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const code = (err as any)?.error
      if (typeof code === 'string' && NOISE_ERROR_CODES.has(code)) return null

      return event
    },
  })
}
