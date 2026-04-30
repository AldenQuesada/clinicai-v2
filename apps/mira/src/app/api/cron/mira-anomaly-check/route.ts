/**
 * Cron: mira-anomaly-check.
 *
 * Schedule: 09:00 SP diario (cron `0 9 * * *`). Era 01h, mas anomaly check
 * mandava broadcast pra todo admin de madrugada · agora roda dentro do
 * horario comercial padrao + tem `defer:true` como rede de seguranca caso
 * clinica especifica abra mais tarde (vide mig 800-88 + business-hours.ts).
 *
 * Detecta gaps operacionais (zero agenda 24h, NaN financeiro, etc) e
 * notifica admin · category='financeiro' agora respeita subscription
 * (admin que marcou "so financeiro" no /configuracoes recebe; quem desligou
 * categoria financeiro nao).
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

    // FINANCEIRO · anomalia operacional (zero agenda, NaN financeiro) afeta
    // receita · admin que opta por "so financeiro" precisa receber. Outros
    // que desligaram a categoria nao recebem (regra antes nao respeitada ·
    // tudo era broadcast). defer:true · se clinica fechada na hora do cron,
    // enfileira pra proxima janela em vez de perder.
    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.anomaly_check',
      text,
      category: 'financeiro',
      msgKey: 'financeiro.anomaly_check',
      defer: true,
    })

    return { anomalies: 1, dispatched: dispatch }
  })
}
