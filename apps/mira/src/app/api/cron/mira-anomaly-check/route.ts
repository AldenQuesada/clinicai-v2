/**
 * Cron: mira-anomaly-check.
 *
 * Schedule: 01:00 diario (cron `0 1 * * *`).
 * Detecta gaps operacionais (zero agenda 24h, NaN financeiro, etc) e
 * notifica admin.
 *
 * RPC esperado: `wa_pro_anomaly_check`. Sem RPC: detecta zero appointments
 * D+1 inteiro (heuristica minima · dispara so se ZERO).
 *
 * TODO P2: ampliar deteccao no fallback (NaN finance, gaps lead pipeline).
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-anomaly-check', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_anomaly_check', { p_clinic_id: clinicId })

    if (!text) {
      // Heuristica minima · zero appointments amanha
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const count = await repos.appointments.countInRange(
        clinicId,
        tomorrow + 'T00:00:00Z',
        dayAfter + 'T00:00:00Z',
      )
      if (count === 0) {
        text = `⚠️ Anomalia: ZERO consultas marcadas pra ${tomorrow}. Vale verificar agenda.`
      }
    }

    if (!text) {
      return { anomalies: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
    }

    // SISTEMICO · anomalia operacional (zero agenda, NaN financeiro) eh sinal
    // critico que admin precisa ver mesmo com subscriptions individuais
    // desligadas. Decisao: NAO filtrar por permissions.msg · mantem broadcast.
    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.anomaly_check',
      text,
    })

    return { anomalies: 1, dispatched: dispatch }
  })
}
