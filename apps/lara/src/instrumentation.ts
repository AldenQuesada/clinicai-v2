/**
 * Next.js instrumentation hook · Camada 11a · roteia init do Sentry pra
 * o config certo de cada runtime.
 *
 * Next 16 chama `register()` uma vez no boot do server (Node ou Edge).
 * Sentry SDK exige init la dentro pra hookar nos lifecycle events
 * (route handlers, server actions, RSC) · sem isso, server-side errors
 * passam batido.
 *
 * Configs reais ficam em `sentry.server.config.ts` / `sentry.edge.config.ts`
 * no root do app · esse arquivo so faz dispatch baseado em
 * `NEXT_RUNTIME`. Fail-soft inteiro: se DSN ausente, cada config faz log
 * warn e sai (vide sentry.*.config.ts).
 *
 * `onRequestError` re-exporta o handler do Sentry pra Next instrumentation
 * hook capturar erros em RSC/route handlers automaticamente (Next 16+).
 */
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
