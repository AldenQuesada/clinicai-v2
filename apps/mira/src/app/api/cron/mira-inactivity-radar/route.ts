/**
 * Cron: mira-inactivity-radar.
 *
 * Schedule: sex 21:00 (cron `0 21 * * 5`).
 * Pacientes/leads sem atividade ha N dias · sugere reativar.
 *
 * RPC esperado: `wa_pro_inactivity_radar`. Fallback: leads sem update >30d.
 *
 * TODO P2: ampliar fallback pra incluir patients (clinic-dashboard schema).
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-inactivity-radar', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_inactivity_radar', { p_clinic_id: clinicId })

    if (!text) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase.from('leads') as any)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .lt('updated_at', cutoff)

      if ((count ?? 0) === 0) {
        return { inactive: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
      }

      text = [
        '🔍 Radar de inatividade · sexta:',
        `• ${count} lead${count === 1 ? '' : 's'} sem update há 30+ dias`,
        '',
        'Vale planejar campanha de reativacao no fim de semana.',
      ].join('\n')
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.inactivity_radar',
      text,
    })

    return { inactive: 1, dispatched: dispatch }
  })
}
