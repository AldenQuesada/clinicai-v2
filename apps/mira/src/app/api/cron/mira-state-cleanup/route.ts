/**
 * Cron: state cleanup + reminder dispatch.
 *
 * Easypanel cron faz GET com header `x-cron-secret: <MIRA_CRON_SECRET>`.
 * - Limpa states expirados (mira_state_cleanup_expired · mig 800-10 · 2min buffer)
 * - Dispara reminder messages (mira_state_reminder_check)
 *
 * Frequencia recomendada: a cada 1min (reminder precisa de granularidade).
 * pg_cron tambem faz o mesmo · belt-and-suspenders.
 *
 * Telemetria (mig 800-10 · F3):
 *   · state.cleanup.batch · count de rows deleted
 *   · state.cleanup.excessive · WARN se count > 50 numa rodada (TTL agressivo
 *     OU acumulo · pode indicar bug em mira_state_set ttl_minutes)
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { createLoggerWithAlerts } from '@/lib/logger-with-alerts'
import { alertSlack } from '@/lib/alerts'
import { renderReminder } from '@/lib/webhook/reminder-templates'
import { getEvolutionService } from '@/services/evolution.service'
import { resolveMiraInstance } from '@/lib/mira-instance'

export const dynamic = 'force-dynamic'

// Logger com alerts integrados (F6) · .warn() dispara Slack alem do log Pino.
const log = createLoggerWithAlerts({ app: 'mira' }).child({ cron: 'mira-state-cleanup' })

// Threshold: cron roda a cada 10min (cleanup) ou 1min (reminder)
// 50+ states expirados numa unica rodada e sinal de:
//   · TTL muito agressivo (ex: ttl_minutes=1 acidental)
//   · Acumulo (cron parou e voltou)
//   · Volume real anormal (parceria nova com 100 vouchers em batch)
//
// F6: 100+ states e anomalia critica · alerta direto pro Slack alem do warn.
const EXCESSIVE_CLEANUP_THRESHOLD = 50
const CRITICAL_CLEANUP_THRESHOLD = 100

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-state-cleanup', async ({ repos, clinicId }) => {
    const cleaned = await repos.miraState.cleanupExpired()

    if (cleaned > 0) {
      if (cleaned > EXCESSIVE_CLEANUP_THRESHOLD) {
        // F6 · alerta humano explicito quando passa de 100 (critical) ·
        // log.warn ja dispara Slack rate-limited mas critical merece
        // bypass do rate limit + severidade error.
        if (cleaned > CRITICAL_CLEANUP_THRESHOLD) {
          void alertSlack(
            `state.cleanup.critical: ${cleaned} states expirados em uma rodada`,
            'error',
            {
              handler: 'mira-state-cleanup',
              clinic_id: clinicId,
              count: cleaned,
              threshold: CRITICAL_CLEANUP_THRESHOLD,
            },
          )
        }
        log.warn(
          { count: cleaned, threshold: EXCESSIVE_CLEANUP_THRESHOLD },
          'state.cleanup.excessive',
        )
      } else {
        log.info({ count: cleaned }, 'state.cleanup.batch')
      }
    }

    const reminders = await repos.miraState.reminderCheck()

    let sent = 0
    let failed = 0
    // Source-of-truth UI · resolve sender 1x antes do loop (cache)
    const senderInstance = await resolveMiraInstance(clinicId, 'partner_response')
    if (reminders.length > 0) {
      const wa = getEvolutionService('mira')
      for (const r of reminders) {
        try {
          const state = r.state as {
            recipient_first_name?: string
            recipient_name?: string
            partnership_id?: string
          }
          let partnerFirstName = 'parceira'
          if (state.partnership_id) {
            const p = await repos.b2bPartnerships.getById(state.partnership_id)
            if (p?.contactName) {
              partnerFirstName = p.contactName.trim().split(/\s+/)[0] ?? 'parceira'
            }
          }
          const text = renderReminder({
            firstName: partnerFirstName,
            recipientName: state.recipient_name ?? 'sua amiga',
            seed: `${r.phone}:${r.expiresAt}`,
          })
          const result = await wa.sendText(r.phone, text)
          await repos.waProAudit.logDispatch({
            clinicId,
            eventKey: 'mira.reminder.voucher_confirm',
            channel: 'text',
            recipientRole: 'partner',
            recipientPhone: r.phone,
            senderInstance,
            textContent: text,
            waMessageId: result.messageId ?? null,
            status: result.ok ? 'sent' : 'failed',
            errorMessage: result.error ?? null,
          })
          if (result.ok) sent++
          else failed++
        } catch {
          failed++
        }
      }
    }

    return {
      cleaned_states: cleaned,
      reminders_total: reminders.length,
      reminders_sent: sent,
      reminders_failed: failed,
    }
  })
}
