/**
 * Cron: mira-financeiro-monthly-goal.
 *
 * Schedule: 09h SP qua e sex (cron `0 9 * * 3,5`).
 * RPC: mira_financial_monthly_goal_text(p_clinic_id) · text ou NULL.
 *
 * Compara receita do mes corrente vs target em
 * clinics.settings->>'financial_monthly_target_brl'. NULL se target nao
 * setado · admin precisa configurar pra ativar.
 *
 * Categoria: financeiro / msgKey: financeiro.monthly_goal.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-financeiro-monthly-goal', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'mira_financial_monthly_goal_text', {
      p_clinic_id: clinicId,
    })

    if (!text) {
      return { dispatched: { recipients: 0, sent: 0, failed: 0 }, skipped: 'no_target_or_no_data' }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.financial_monthly_goal',
      text,
      category: 'financeiro',
      msgKey: 'financeiro.monthly_goal',
      defer: true,
    })

    return { dispatched: dispatch }
  })
}
