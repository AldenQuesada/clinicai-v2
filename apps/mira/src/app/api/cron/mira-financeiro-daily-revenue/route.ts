/**
 * Cron: mira-financeiro-daily-revenue.
 *
 * Schedule: 08h SP diario seg-sab (cron `0 8 * * 1-6`).
 * RPC: mira_financial_daily_revenue_text(p_clinic_id) · text ou NULL.
 *
 * Compara receita ontem vs avg ultimos 7 dias uteis. NULL se ontem foi
 * sem appointments · skipa silently (sem mensagem em dia neutro).
 *
 * Categoria: financeiro / msgKey: financeiro.daily_revenue · admin que
 * marcou "so financeiro" recebe; quem desligou financeiro nao.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-financeiro-daily-revenue', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'mira_financial_daily_revenue_text', {
      p_clinic_id: clinicId,
    })

    if (!text) {
      return { dispatched: { recipients: 0, sent: 0, failed: 0 }, skipped: 'no_data' }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.financial_daily_revenue',
      text,
      category: 'financeiro',
      msgKey: 'financeiro.daily_revenue',
      defer: true,
    })

    return { dispatched: dispatch }
  })
}
