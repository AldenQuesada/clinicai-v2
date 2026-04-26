/**
 * Cron: dedicated reminder dispatch (sem cleanup).
 *
 * Variante do mira-state-cleanup pra agendar com cadencia maior caso queira
 * separar (ex: cleanup 5min, reminder 1min). Em P1 mira-state-cleanup ja
 * cobre os 2 · esse handler existe pra Easypanel poder configurar separado
 * se Alden preferir (mantém ambos como entradas).
 *
 * Frequencia recomendada: a cada 1min.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { renderReminder } from '@/lib/webhook/reminder-templates'
import { getEvolutionService } from '@/services/evolution.service'
import { resolveMiraInstance } from '@/lib/mira-instance'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-state-reminder-check', async ({ repos, clinicId }) => {
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
      reminders_total: reminders.length,
      reminders_sent: sent,
      reminders_failed: failed,
    }
  })
}
