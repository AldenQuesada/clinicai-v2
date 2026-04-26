/**
 * Cron: mira-weekly-roundup.
 *
 * Schedule: seg 10:00 (cron `0 10 * * 1`).
 * Envia resumo da semana anterior + plano semana atual pra admin.
 *
 * RPC esperado: `wa_pro_weekly_roundup`. Fallback: count semana passada.
 *
 * TODO P2: extrair fallback pra RPC canonica.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-weekly-roundup', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_weekly_roundup', { p_clinic_id: clinicId })

    if (!text) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

      const [leads7d, leadsPrev, vouchers7d] = await Promise.all([
        repos.leads.count(clinicId, { createdSince: sevenDaysAgo }),
        repos.leads.count(clinicId, { createdSince: fourteenDaysAgo }),
        repos.b2bVouchers.countByPeriod(clinicId, sevenDaysAgo),
      ])
      const leadsPrevWeek = leadsPrev - leads7d
      const trend = leadsPrevWeek === 0 ? '—' : `${leads7d > leadsPrevWeek ? '↑' : leads7d < leadsPrevWeek ? '↓' : '→'} vs ${leadsPrevWeek} sem passada`

      text = [
        '📊 Round-up semanal:',
        `• ${leads7d} lead${leads7d === 1 ? '' : 's'} (${trend})`,
        `• ${vouchers7d} voucher${vouchers7d === 1 ? '' : 's'} emitido${vouchers7d === 1 ? '' : 's'}`,
        '',
        'Veja top parceiras em /dashboard',
      ].join('\n')
    }

    // Subscription · roundup semanal de leads + agenda = agenda.gaps_weekly
    // (mistura financeiro/agenda · agenda eh a categoria mais analoga ao
    // "resumo da semana" na UI atual)
    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.weekly_roundup',
      text,
      category: 'agenda',
      msgKey: 'agenda.gaps_weekly',
    })

    return dispatch
  })
}
