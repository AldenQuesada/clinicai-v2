/**
 * Cron: mira-daily-digest.
 *
 * Schedule: 10:00 seg-sab (cron `0 10 * * 1-6`).
 * Envia pra admin: agenda do dia + tasks pendentes + KPIs noturnos.
 *
 * Tenta RPC `wa_pro_daily_digest` (clinic-dashboard) primeiro; fallback monta
 * digest minimo (count appointments hoje + leads novos ontem) caso nao exista.
 *
 * TODO P2: extrair fallback pra RPC canonica `wa_pro_daily_digest`.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-daily-digest', async ({ supabase, repos, clinicId }) => {
    let text = await tryRpcText(supabase, 'wa_pro_daily_digest', { p_clinic_id: clinicId })

    if (!text) {
      // Fallback minimo · count appointments do dia + leads novos hoje
      const today = new Date().toISOString().slice(0, 10)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const apptsToday = await repos.appointments.countInRange(
        clinicId,
        today + 'T00:00:00Z',
        tomorrow + 'T00:00:00Z',
      )

      const leadsToday = await repos.leads.count(clinicId, {
        createdSince: today + 'T00:00:00.000Z',
      })

      text = [
        `Bom dia! ☀️ Agenda de hoje (${fmtBr(today)}):`,
        `• ${apptsToday} consulta${apptsToday === 1 ? '' : 's'} marcada${apptsToday === 1 ? '' : 's'}`,
        `• ${leadsToday} lead${leadsToday === 1 ? '' : 's'} novo${leadsToday === 1 ? '' : 's'} hoje`,
        '',
        'Detalhes via /dashboard',
      ].join('\n')
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.daily_digest',
      text,
    })

    return { source: text ? 'composed' : 'empty', ...dispatch }
  })
}

function fmtBr(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z')
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}
