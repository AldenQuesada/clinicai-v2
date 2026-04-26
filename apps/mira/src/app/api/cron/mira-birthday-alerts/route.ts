/**
 * Cron: mira-birthday-alerts.
 *
 * Schedule: 10:00 diario (cron `0 10 * * *`).
 * Lista pacientes/leads aniversariantes e notifica admin pra acao manual.
 *
 * RPC esperado: `wa_pro_birthday_alerts`. Fallback: query mes/dia em leads.
 *
 * TODO P2: extrair fallback pra RPC canonica + suportar query patients.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-birthday-alerts', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_birthday_alerts', { p_clinic_id: clinicId })

    if (!text) {
      const today = new Date()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')

      const list = await repos.leads.listBirthdaysOfDay(clinicId, `${mm}-${dd}`, 20)
      if (list.length === 0) {
        return { birthdays: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
      }

      const lines = list.map((l) =>
        `• ${l.name ?? 'sem nome'}${l.phone ? ` · ${l.phone}` : ''}`,
      )
      text = [
        `🎂 Aniversariantes de hoje (${dd}/${mm}):`,
        ...lines,
        '',
        'Manda mensagem com carinho 💛',
      ].join('\n')
    }

    // Subscription · pacientes/leads aniversariantes mapeia em pacientes.followup_due
    // (e o "lembre-se de mandar mensagem" mais analogo na lista atual de keys)
    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.birthday_alerts',
      text,
      category: 'pacientes',
      msgKey: 'pacientes.followup_due',
    })

    return { birthdays: 1, dispatched: dispatch }
  })
}
