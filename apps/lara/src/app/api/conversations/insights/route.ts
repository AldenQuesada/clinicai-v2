/**
 * GET /api/conversations/insights · KPIs globais do clinic pro top bar.
 *
 * Resolve fix P-03/P-04 do roadmap 2026-04-29 · counts independentes do
 * filtro ativo na lista (urgentes/aguardando/lara_ativa nao zeram ao trocar
 * de aba e resolvidos_hoje conta certo mesmo com filtro Abertas).
 *
 * ADR-012: ConversationRepository.getInsights (4 counts em paralelo).
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 *
 * Janela "hoje" calculada server-side em UTC do container · offset BRT
 * (UTC-3) ajustado client-side se necessario · vamos com UTC pra simplicidade
 * inicial e refinamos se Mirian reportar drift.
 */

import { NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'
import { DOCTOR_USER_ID } from '@/lib/clinic-profiles'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { ctx, repos } = await loadServerReposContext()

    const now = Date.now()
    const fiveMinAgoIso = new Date(now - 5 * 60 * 1000).toISOString()

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayStartIso = todayStart.toISOString()

    const insights = await repos.conversations.getInsights(ctx.clinic_id, {
      fiveMinAgoIso,
      todayStartIso,
      // SLA Dra · separa fila da doutora da fila secretaria. Hardcoded
      // single-tenant hoje · ver lib/clinic-profiles.ts.
      doctorUserId: DOCTOR_USER_ID,
    })

    return NextResponse.json(insights)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Insights error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
