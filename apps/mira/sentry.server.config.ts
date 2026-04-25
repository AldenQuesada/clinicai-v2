/**
 * Sentry · server-side runtime config (Node.js / Next.js server actions, route
 * handlers, cron workers).
 *
 * Padrao "noop quando ausente": se `NEXT_PUBLIC_SENTRY_DSN` nao estiver setado
 * (dev local, primeira boot em prod sem ENV configurado), o `init` e chamado
 * sem `dsn` · SDK fica inerte (nao envia eventos, nao crash). Ao popular o
 * env var no Easypanel, basta restart pra ativar sem mudar codigo.
 *
 * Tracing/profiling desabilitado por enquanto · F6 foca em error/alert capture.
 * Liga depois quando virar custo justificado.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || ''
const env = process.env.NODE_ENV || 'development'

Sentry.init({
  dsn: dsn || undefined,
  environment: env,
  // Sample rate baixo em prod · evita custo desnecessario.
  // Errors sao capturados 100% (level >= error), tracing fica em 10%.
  tracesSampleRate: env === 'production' ? 0.1 : 0,
  // Em dev nao polua o dashboard com replays
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // PII proibida · logger Pino ja redacta. Belt-and-suspenders no Sentry tambem.
  sendDefaultPii: false,
  // Filtros: mascarar headers/cookies/secrets antes de subir
  beforeSend(event) {
    // Remove req.headers se vier (Next.js auto-instrumentation)
    if (event.request?.headers) {
      delete event.request.headers
    }
    if (event.request?.cookies) {
      delete event.request.cookies
    }
    return event
  },
})
