/**
 * Alert system · F6 (incidente 26 vouchers perdidos · 2026-04-25).
 *
 * Tres tiers:
 *   1. alertSentry · errors / exceptions · vai pro dashboard Sentry com tags
 *      e fingerprint pra agrupamento. Use pra falhas tecnicas (RPC fail, JS
 *      exception, request 500, race detected).
 *   2. alertSlack  · mensagens humanas (info/warn/error) com emoji por
 *      severidade · POST direto pro Slack incoming webhook. Use pra alertas
 *      operacionais que algum humano precisa ver imediatamente (queue
 *      travada, anomaly detection, threshold excedido).
 *   3. alertCritical · combina os dois · use quando o erro e tao grave
 *      que precisa Sentry (rastreio tecnico) E Slack (notificacao humana).
 *
 * Comportamento noop:
 *   · Sem NEXT_PUBLIC_SENTRY_DSN → alertSentry vira no-op (Sentry SDK ja
 *     handle isso internamente, mas guard explicito evita warn em log).
 *   · Sem SLACK_WEBHOOK_URL → alertSlack vira no-op silencioso · permite
 *     dev local sem precisar configurar webhook.
 *
 * Idempotency: nenhuma · cada chamada gera 1 evento. Caller responsavel
 * por deduplicar (ex: throttle de logger-with-alerts via rate-limit).
 *
 * PII: NUNCA passe phone/email raw no `context` · use hashPhone do logger
 * package. Sentry tambem tem beforeSend no init pra filtro adicional.
 */

import * as Sentry from '@sentry/nextjs'

export type AlertSeverity = 'info' | 'warn' | 'error'

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: ':information_source:',
  warn: ':warning:',
  error: ':rotating_light:',
}

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: '#36a64f', // verde
  warn: '#ffae42', // ambar
  error: '#cc0000', // vermelho
}

/**
 * Captura erro no Sentry com tags + extra context.
 *
 * Tags conhecidas (filtraveis no dashboard):
 *   - clinic_id   · multi-tenant scope
 *   - handler     · qual route/cron disparou
 *   - app         · sempre 'mira' (preserva alinhamento com logger Pino)
 *
 * Extras: qualquer outro dado nao-indexavel (queue_id, wa_message_id,
 * partnership_id, etc).
 *
 * Noop quando DSN ausente · Sentry SDK ja garante isso, mas mantemos
 * guard explicito pra clareza e evitar overhead de scope creation.
 */
export function alertSentry(
  err: Error | unknown,
  context: Record<string, unknown> = {},
): void {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return

  const error = err instanceof Error ? err : new Error(String(err))

  // Separa tags (string-only, indexaveis) de extras (qualquer JSON)
  const tagKeys = ['clinic_id', 'handler', 'app', 'route', 'cron']
  const tags: Record<string, string> = { app: 'mira' }
  const extras: Record<string, unknown> = {}

  for (const [k, v] of Object.entries(context)) {
    if (tagKeys.includes(k) && typeof v === 'string') {
      tags[k] = v
    } else {
      extras[k] = v
    }
  }

  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(tags)) scope.setTag(k, v)
    for (const [k, v] of Object.entries(extras)) scope.setExtra(k, v)
    Sentry.captureException(error)
  })
}

/**
 * Envia mensagem humana pro Slack via incoming webhook.
 *
 * Formato: attachment com cor por severidade + emoji + context fields.
 * Slack incoming webhooks aceitam JSON simples · sem auth header.
 *
 * Best-effort: se Slack nao responder em 3s, log e segue. NAO joga
 * exception · alerta nao pode ser ponto de falha do sistema.
 *
 * Noop quando SLACK_WEBHOOK_URL ausente.
 */
export async function alertSlack(
  message: string,
  severity: AlertSeverity = 'info',
  context: Record<string, unknown> = {},
): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return

  const fields = Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 10) // Slack limita ~10 fields uteis
    .map(([k, v]) => ({
      title: k,
      value: typeof v === 'object' ? JSON.stringify(v).slice(0, 500) : String(v).slice(0, 500),
      short: typeof v !== 'object' && String(v).length < 40,
    }))

  const payload = {
    text: `${SEVERITY_EMOJI[severity]} *[mira/${severity.toUpperCase()}]* ${message}`,
    attachments: [
      {
        color: SEVERITY_COLOR[severity],
        fields,
        footer: `mira · ${process.env.NODE_ENV || 'dev'}`,
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) {
      // Best-effort: log mas nao throw · alerta nao pode quebrar fluxo
      // eslint-disable-next-line no-console
      console.error('[alerts] slack webhook nao OK', res.status, await res.text().catch(() => ''))
    }
  } catch (e) {
    // Best-effort idem
    // eslint-disable-next-line no-console
    console.error('[alerts] slack webhook falhou', e instanceof Error ? e.message : e)
  }
}

/**
 * Combina Sentry (errors) + Slack (humanos) · use pra incidentes que
 * precisam dos dois canais. Roda os dois em paralelo · Slack e fire-and-
 * forget mas o caller pode aguardar com `await alertCritical(...)`.
 *
 * Exemplo:
 *   await alertCritical(
 *     'voucher_dispatch.zumbi: voucher emitido mas queue nao atualizou',
 *     err,
 *     { handler: 'b2b-voucher-dispatch-worker', clinic_id, queue_id, voucher_id }
 *   )
 */
export async function alertCritical(
  message: string,
  err: Error | unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  alertSentry(err, context)
  await alertSlack(message, 'error', context)
}
