/**
 * Cron: mira-preconsult-alerts.
 *
 * Schedule: every 5 min · 11-23h seg-sab (cron `*\/5 11-23 * * 1-6`).
 * Alerta admin 30min antes de cada appointment.
 *
 * RPC esperado: `wa_pro_pre_consult_alerts` (clinic-dashboard) · idempotente
 * (marca alert_sent=true pra nao re-enviar). Fallback: query direta + dispatch.
 *
 * TODO P2: garantir idempotencia no fallback (se RPC ausente, sem flag temos
 * risco de re-disparo). Hoje fallback so dispara se RPC nao retornar texto.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-preconsult-alerts', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'wa_pro_pre_consult_alerts', { p_clinic_id: clinicId })

    if (!text) {
      // Sem RPC e sem dispatch · evita risco de re-envio
      return { alerts: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.preconsult_alert',
      text,
    })

    return { alerts: 1, dispatched: dispatch }
  })
}
