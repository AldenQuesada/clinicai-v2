/**
 * Cron: state cleanup + reminder dispatch.
 *
 * Easypanel cron faz GET com header `x-cron-secret: <MIRA_CRON_SECRET>`.
 * - Limpa states expirados (mira_state_cleanup_expired)
 * - Dispara reminder messages (mira_state_reminder_check)
 *
 * Frequencia recomendada: a cada 1min (reminder precisa de granularidade).
 * pg_cron tambem faz o mesmo · belt-and-suspenders.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { makeMiraRepos } from '@/lib/repos'
import { renderReminder } from '@/lib/webhook/reminder-templates'
import { getEvolutionService } from '@/services/evolution.service'
import { resolveClinicId } from '@/lib/clinic'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'mira' })

export const dynamic = 'force-dynamic'

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function GET(req: NextRequest) {
  const secret = process.env.MIRA_CRON_SECRET ?? ''
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'cron_secret_missing' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const repos = makeMiraRepos(supabase)
  const clinicId = await resolveClinicId(supabase)

  // 1. Cleanup expired states
  const cleaned = await repos.miraState.cleanupExpired()

  // 2. Reminder check · 5min antes do voucher_confirm expirar
  const reminders = await repos.miraState.reminderCheck()

  let sent = 0
  let failed = 0
  if (reminders.length > 0) {
    const wa = getEvolutionService('mira')

    for (const r of reminders) {
      try {
        const state = r.state as {
          recipient_first_name?: string
          recipient_name?: string
          partnership_id?: string
        }
        // Pega first name da parceira (via partnership)
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
          senderInstance: process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian',
          textContent: text,
          waMessageId: result.messageId ?? null,
          status: result.ok ? 'sent' : 'failed',
          errorMessage: result.error ?? null,
        })
        if (result.ok) sent++
        else failed++
      } catch (err) {
        failed++
        log.error({ err, phone: r.phone }, 'mira.cron.reminder_dispatch_failed')
      }
    }
  }

  return NextResponse.json({
    ok: true,
    cleaned_states: cleaned,
    reminders_total: reminders.length,
    reminders_sent: sent,
    reminders_failed: failed,
  })
}
