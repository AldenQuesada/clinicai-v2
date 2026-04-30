/**
 * Cron: mira-financeiro-ai-cost-cap.
 *
 * Schedule: 09h SP segunda (cron `0 9 * * 1`).
 * RPC: mira_financial_ai_cost_text(p_clinic_id) · text ou NULL.
 *
 * Estrutural: tabela `mira_ai_usage` ainda nao existe · RPC retorna NULL
 * sempre, cron skipa. Quando AI tracking for implementado, RPC body se
 * atualiza · cron e UI ja prontos.
 *
 * Categoria: financeiro / msgKey: financeiro.ai_cost_cap.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-financeiro-ai-cost-cap', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'mira_financial_ai_cost_text', {
      p_clinic_id: clinicId,
    })

    if (!text) {
      return { dispatched: { recipients: 0, sent: 0, failed: 0 }, skipped: 'ai_tracking_not_configured' }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.financial_ai_cost_cap',
      text,
      category: 'financeiro',
      msgKey: 'financeiro.ai_cost_cap',
      defer: true,
    })

    return { dispatched: dispatch }
  })
}
