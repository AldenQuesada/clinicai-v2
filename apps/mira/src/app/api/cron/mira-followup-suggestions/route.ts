/**
 * Cron: mira-followup-suggestions.
 *
 * Schedule: 12:00 diario (cron `0 12 * * *`).
 * Suggestions Claude Haiku pra leads esquecidos · ajuda admin retomar.
 *
 * RPC esperado: `wa_pro_followup_suggestions` (LLM lateral em DB ou via app).
 * Sem RPC: skip · LLM call requer custo, melhor centralizar.
 *
 * TODO P2: implementar fallback chamando @clinicai/ai com Haiku se RPC ausente.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-followup-suggestions', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'wa_pro_followup_suggestions', { p_clinic_id: clinicId })

    if (!text) {
      return { suggestions: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.followup_suggestions',
      text,
    })

    return { suggestions: 1, dispatched: dispatch }
  })
}
