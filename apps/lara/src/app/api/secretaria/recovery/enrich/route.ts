/**
 * POST /api/secretaria/recovery/enrich · Recovery Radar · Prompt 4.
 *
 * Enriquece findings `open` do Recovery Radar com sugestão de IA (suggested_message
 * /action/owner/deadline). NÃO envia WhatsApp · humano aprova depois.
 *
 * ⚠️ FASE DRY-RUN-ONLY (Prompt 4D): esta rota IGNORA `dry_run`/`force` do body e
 * roda SEMPRE com `dry_run=true, force=false`. Como o backend usa service_role,
 * permitir `dry_run=false`/`force=true` via body deixaria qualquer usuário
 * autenticado com tenant válido persistir/forçar sugestões antes de termos UI,
 * role-check e fluxo operacional. A persistência (`dry_run=false`) será liberada
 * em prompt futuro, depois do dry-run live e/ou gate por role/secret.
 *
 * Body aceito nesta fase:
 *   { "limit": 5, "priority": ["P0","P1"] }   // dry_run/force são ignorados
 *
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 * Cost control: callAnthropic checa budget (BUDGET_EXCEEDED → 402).
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'
import { enrichRecoveryFindings, ENRICH_HARD_CAP } from '@/server/recovery/recovery-ai-analyzer'

export const dynamic = 'force-dynamic'

const ALLOWED_PRIORITIES = ['P0', 'P1', 'P2', 'P3']

export async function POST(request: NextRequest) {
  try {
    const { ctx } = await loadServerReposContext()
    if (!ctx?.clinic_id) {
      return NextResponse.json({ error: 'no_tenant' }, { status: 401 })
    }

    // dry_run/force NÃO são lidos do body nesta fase (ver doc acima · trava de segurança).
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number
      priority?: string[]
    }

    // sanitize priority · default P0/P1 (P2/P3 só se explicitamente pedidos)
    const priority = Array.isArray(body.priority)
      ? body.priority.filter((p) => ALLOWED_PRIORITIES.includes(p))
      : undefined
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), ENRICH_HARD_CAP)

    const result = await enrichRecoveryFindings({
      clinicId: ctx.clinic_id,
      userId: ctx.user_id ?? undefined,
      limit,
      priority: priority && priority.length > 0 ? priority : undefined,
      // FASE DRY-RUN-ONLY · hardcoded · NÃO derivar do body (trava de segurança 4D).
      dry_run: true,
      force: false,
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    if (message.startsWith('BUDGET_EXCEEDED')) {
      return NextResponse.json({ error: 'budget_exceeded', detail: message }, { status: 402 })
    }
    console.error('[API] recovery/enrich error:', message)
    return NextResponse.json({ error: 'recovery_enrich_failed' }, { status: 500 })
  }
}
