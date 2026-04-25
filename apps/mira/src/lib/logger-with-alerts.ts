/**
 * Logger com alerts integrados · F6.
 *
 * Wrapping leve em volta do logger Pino do `@clinicai/logger`. Mantem 100% da
 * API Pino (info/warn/error/debug/child) e adiciona side-effect de disparar
 * alertSentry em `.error()` e alertSlack em `.warn()` — quando passar do
 * threshold de rate-limit configurado.
 *
 * Por que rate-limit:
 *   Bursts de warn/error em loop (ex: queue trava, 500 retries em 10s) podem
 *   estourar quota Sentry/Slack e causar mute no canal humano. Threshold
 *   `ALERT_THRESHOLD_WARN_RATE_PER_MIN` (default 5) limita ao N alertas/min
 *   POR-bindings (mesma chave de evento se repetir, so o primeiro vira
 *   alerta · resto so loga normal).
 *
 * Como usar:
 *   import { createLoggerWithAlerts } from '@/lib/logger-with-alerts'
 *   const log = createLoggerWithAlerts({ app: 'mira' }).child({ cron: 'foo' })
 *   log.error({ ... }, 'foo.exception')   // dispara Sentry + log
 *   log.warn({ ... }, 'foo.threshold')    // dispara Slack + log (se < threshold)
 *
 * Threshold "info":
 *   `.info()` NAO dispara alerta automatico · use alertSlack('mensagem', 'info')
 *   diretamente quando quiser notificar info critico (ex: deploy, queue drained).
 *
 * Preserva PII redact do Pino · alerta tambem so vai com context ja redactado
 * (caller deve chamar hashPhone antes de incluir phone no context).
 */

import { createLogger, hashPhone, maskEmail, type Logger, type AppName } from '@clinicai/logger'
import { alertSentry, alertSlack } from './alerts'

const RATE_LIMIT_WINDOW_MS = 60_000

function getThreshold(): number {
  const raw = process.env.ALERT_THRESHOLD_WARN_RATE_PER_MIN
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 5
}

// Map global · key = msg/event identifier · value = timestamps de alertas no
// ultimo minuto. Reset oportunistico quando entry > windowMs old.
const alertHistory = new Map<string, number[]>()

function shouldAlert(key: string): boolean {
  const now = Date.now()
  const threshold = getThreshold()
  const arr = alertHistory.get(key) ?? []
  const recent = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= threshold) {
    alertHistory.set(key, recent) // mantem mas nao dispara
    return false
  }
  recent.push(now)
  alertHistory.set(key, recent)
  return true
}

interface LoggerWithAlertsOptions {
  app: AppName
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
}

/**
 * Cria logger Pino com side-effect de alerta em .warn/.error.
 *
 * Retorna o Logger Pino raw (mesma type signature do createLogger) ·
 * comportamento `.warn`/`.error` substituido via Proxy pra interceptar.
 * `.child()` continua funcionando · cada child herda os mesmos hooks.
 */
export function createLoggerWithAlerts(opts: LoggerWithAlertsOptions): Logger {
  const base = createLogger(opts)
  return wrapLogger(base)
}

function wrapLogger(log: Logger): Logger {
  // Proxy pra interceptar .error/.warn/.child · resto passa direto.
  return new Proxy(log, {
    get(target, prop, receiver) {
      if (prop === 'error') {
        return function wrappedError(...args: unknown[]) {
          // Pino tem 2 assinaturas: error(obj, msg) ou error(msg)
          const [first, second] = args
          const ctx = typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : {}
          const msg = typeof first === 'string' ? first : (second as string | undefined) ?? 'error'
          // Sentry sempre que DSN setado · errors sao 100% (sem rate-limit)
          // Mas usa key+msg pra evitar burst infinito
          if (shouldAlert(`error:${msg}`)) {
            const err = (ctx.err instanceof Error
              ? ctx.err
              : ctx.error instanceof Error
                ? ctx.error
                : new Error(msg)) as Error
            alertSentry(err, { ...ctx, handler: typeof ctx.handler === 'string' ? ctx.handler : msg })
          }
          // log normal
          return (target.error as (...a: unknown[]) => void).apply(target, args)
        }
      }
      if (prop === 'warn') {
        return function wrappedWarn(...args: unknown[]) {
          const [first, second] = args
          const ctx = typeof first === 'object' && first !== null ? (first as Record<string, unknown>) : {}
          const msg = typeof first === 'string' ? first : (second as string | undefined) ?? 'warn'
          if (shouldAlert(`warn:${msg}`)) {
            // Fire-and-forget · Slack tem timeout interno
            void alertSlack(msg, 'warn', ctx)
          }
          return (target.warn as (...a: unknown[]) => void).apply(target, args)
        }
      }
      if (prop === 'child') {
        return function wrappedChild(...args: unknown[]) {
          // Cast via unknown · child() generics complexas do Pino nao batem
          // com nosso wrapper, mas runtime e identico (apply transparente).
          const child = (target.child as unknown as (...a: unknown[]) => Logger).apply(
            target,
            args,
          )
          return wrapLogger(child)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Logger
}

// Re-export utils PII pra ergonomia de imports caller-side
export { hashPhone, maskEmail }
export type { Logger }
