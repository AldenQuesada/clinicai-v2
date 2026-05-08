/**
 * GET /api/secretaria/kpis
 *
 * Patch SECRETARIA KPI A (2026-05-07) · counts reais (independentes da
 * paginacao da lista) pra topo da Secretaria. Antes desse patch, KPIs eram
 * `.filter().length` no array client de 50 itens · subestimavam quando
 * havia mais de 50 conversas (auditoria 2026-05-07: 91 reais vs 50
 * mostrados).
 *
 * Fonte: wa_conversations_operational_view (mesma SoT que governa
 * is_dra/is_luciana/operational_owner). 5 COUNT(*) em paralelo no servidor.
 *
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 *
 * Resposta:
 *   { total, luciana, mirian, aguardando, urgente }
 *
 * NAO mexe em /api/conversations/insights (que serve /conversas Lara/SDR
 * com semantica diferente · urgentes/aguardando/lara_ativa/dra/etc).
 */

import { NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const counts = await repos.conversations.getSecretariaKpiCounts(ctx.clinic_id)
    return NextResponse.json(counts)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Secretaria KPIs error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
