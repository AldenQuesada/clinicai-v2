/**
 * Logger estruturado JSON (Pino) · clinic-dashboard Gap 3.
 *
 * Substitui console.log puro · saida estruturada em JSON com:
 * - level, time, msg
 * - request_id (se passado)
 * - clinic_id, user_id (se passado)
 * - cost_usd (cost tracking IA · gap 2)
 * - sem PII raw (phone vira hash, email vira mask)
 *
 * Uso:
 *   import { createLogger } from '@clinicai/logger'
 *   const log = createLogger({ app: 'lara' })
 *   log.info({ clinic_id, user_id, action: 'message_received' }, 'Processado')
 *   log.error({ err, request_id }, 'Falha ao chamar Claude')
 */

import pino, { type Logger, type LoggerOptions } from 'pino'
import { createHash } from 'crypto'

export type AppName = 'lara' | 'mira' | 'dashboard' | 'shared'

export interface CreateLoggerOptions {
  app: AppName
  /** Override level via env (LOG_LEVEL) ou explicit */
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
}

/**
 * Cria logger Pino com defaults clinic-dashboard.
 * Em dev (NODE_ENV !== 'production'): pretty-printed.
 * Em prod: JSON puro pra ingestion (Easypanel logs, futuramente Loki/Grafana).
 */
export function createLogger(opts: CreateLoggerOptions): Logger {
  const isDev = process.env.NODE_ENV !== 'production'
  const level = opts.level ?? (process.env.LOG_LEVEL as LoggerOptions['level']) ?? 'info'

  const config: LoggerOptions = {
    level,
    base: { app: opts.app, env: process.env.NODE_ENV || 'development' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      // PII raw NUNCA loga · censura paths comuns
      paths: [
        'phone',
        'email',
        '*.phone',
        '*.email',
        'cpf',
        '*.cpf',
        'access_token',
        'api_key',
        '*.access_token',
        '*.api_key',
        'authorization',
        'cookie',
      ],
      remove: false, // mantem [REDACTED] pra auditoria
    },
  }

  if (isDev) {
    config.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  }

  return pino(config)
}

/** Hash SHA-256 truncado pra phone log-safe · "5544991XXXXXX" */
export function hashPhone(phone: string): string {
  if (!phone) return ''
  return 'ph_' + createHash('sha256').update(String(phone)).digest('hex').slice(0, 12)
}

/** Mask email pra log-safe · "f***@gmail.com" */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return ''
  const [user, domain] = email.split('@')
  if (!user || !domain) return ''
  return user.charAt(0) + '***@' + domain
}

export type { Logger } from 'pino'
