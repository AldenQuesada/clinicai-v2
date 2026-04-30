/**
 * Cron: mira-financeiro-churn-alert.
 *
 * Schedule: 09h SP sexta (cron `0 9 * * 5`).
 * RPC: mira_financial_churn_alert_text(p_clinic_id, p_silent_days int)
 * · text ou NULL.
 *
 * Conta pacientes silent (last appointment finalizado entre 365d-60d e
 * zero atividade nos ultimos 60d). Threshold de 60d eh default · clinic
 * pode setar settings.churn_silent_days futuramente.
 *
 * Categoria: financeiro / msgKey: financeiro.churn_alert.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

const DEFAULT_SILENT_DAYS = 60

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-financeiro-churn-alert', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'mira_financial_churn_alert_text', {
      p_clinic_id: clinicId,
      p_silent_days: DEFAULT_SILENT_DAYS,
    })

    if (!text) {
      return { dispatched: { recipients: 0, sent: 0, failed: 0 }, skipped: 'no_silent_patients' }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.financial_churn_alert',
      text,
      category: 'financeiro',
      msgKey: 'financeiro.churn_alert',
      defer: true,
    })

    return { dispatched: dispatch }
  })
}
