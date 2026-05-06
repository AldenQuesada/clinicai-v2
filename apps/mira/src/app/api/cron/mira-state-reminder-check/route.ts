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
import { resolveMiraInstance } from '@/lib/mira-instance'
import { createEvolutionServiceForMiraChannel } from '@/lib/mira-channel-evolution'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-state-reminder-check', async ({ repos, clinicId, supabase }) => {
    const reminders = await repos.miraState.reminderCheck()

    let sent = 0
    let failed = 0
    let skippedNoChannel = 0
    // Source-of-truth UI · resolve sender 1x antes do loop (cache · log-only)
    const senderInstance = await resolveMiraInstance(clinicId, 'partner_response')
    if (reminders.length > 0) {
      // Audit C2 (2026-05-05): canal estrito · sem fallback mira-mirian.
      const wa = await createEvolutionServiceForMiraChannel(
        supabase,
        clinicId,
        'partner_response',
      )
      if (!wa) {
        // Sem canal ativo · skip todo o batch · zero send
        skippedNoChannel = reminders.length
        return {
          reminders_total: reminders.length,
          reminders_sent: 0,
          reminders_failed: 0,
          reminders_skipped_no_channel: skippedNoChannel,
        }
      }
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
      reminders_skipped_no_channel: skippedNoChannel,
    }
  })
}
