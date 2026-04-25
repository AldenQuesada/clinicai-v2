/**
 * Cron: mira-evening-digest.
 *
 * Schedule: 23:00 seg-sab (cron `0 23 * * 1-6`).
 * Envia resumo do dia + agenda amanha pra admin.
 *
 * RPC esperado: `wa_pro_evening_digest`. Fallback: counts simples.
 *
 * TODO P2: extrair fallback pra RPC canonica.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-evening-digest', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_evening_digest', { p_clinic_id: clinicId })

    if (!text) {
      const todayIso = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').toISOString()
      const tomorrowDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const dayAfterTomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const apptsAmanha = await repos.appointments.countInRange(
        clinicId,
        tomorrowDate + 'T00:00:00Z',
        dayAfterTomorrow + 'T00:00:00Z',
      )

      const leadsHoje = await repos.leads.count(clinicId, { createdSince: todayIso })
      const vouchersHoje = await repos.b2bVouchers.countByPeriod(clinicId, todayIso)

      text = [
        '🌙 Resumo do dia:',
        `• ${leadsHoje} lead${leadsHoje === 1 ? '' : 's'} hoje`,
        `• ${vouchersHoje} voucher${vouchersHoje === 1 ? '' : 's'} emitido${vouchersHoje === 1 ? '' : 's'}`,
        '',
        `🗓️ Amanhã: ${apptsAmanha} consulta${apptsAmanha === 1 ? '' : 's'}`,
        '',
        'Bom descanso 💛',
      ].join('\n')
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.evening_digest',
      text,
    })

    return dispatch
  })
}
