/**
 * GET /api/conversations/[id]/assignment-events
 *
 * Historico semantico de transferencias/devolucoes da conversa · le da view
 * public.wa_conversation_assignment_events_view (Mig 148 · grants 149) que
 * rotula transicoes do audit bruto em assigned/returned/reassigned/
 * profile_changed/updated.
 *
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 * Conv ownership validada antes da query (404 se nao existe · 403 se cross-clinic).
 *
 * Limit: cap em 50 eventos por chamada · ordem audit_at DESC.
 *
 * Resposta · array de eventos (snake_case · padrao da API · view-derived):
 *   {
 *     audit_at: ISO string,
 *     assignment_action: 'assigned'|'returned'|'reassigned'|'profile_changed'|'updated',
 *     from_owner: 'secretaria'|'alden'|'mirian'|'luciana'|'responsavel',
 *     from_assigned_to_name: string|null,
 *     to_owner: same enum,
 *     to_assigned_to_name: string|null,
 *     actor_role: string|null,
 *     audit_reason: string|null,
 *     phone: string|null,
 *     display_name: string|null,
 *     status: string|null
 *   }
 *
 * NAO retorna old_data/new_data brutos · NAO retorna audit_id (id interno
 * nao eh exposto · padrao do app · spec deste patch).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

const MAX_LIMIT = 50

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const limitRaw = parseInt(searchParams.get('limit') || String(MAX_LIMIT), 10)
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : MAX_LIMIT))

  try {
    const { ctx, repos } = await loadServerReposContext()

    // 1. Conv lookup + tenant guard (mesmo padrao /copilot · /improve · /assign).
    const conv = await repos.conversations.getById(id)
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    if (conv.clinicId !== ctx.clinic_id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // 2. Le eventos da view semantica · scope duplo (clinic + conv).
    const events = await repos.conversations.getAssignmentEvents(id, ctx.clinic_id, limit)

    // 3. Mapeia DTO camelCase → snake_case JSON (padrao da API · view fields).
    const items = events.map((e) => ({
      audit_at: e.auditAt,
      assignment_action: e.assignmentAction,
      from_owner: e.fromOwner,
      from_assigned_to_name: e.fromAssignedToName,
      to_owner: e.toOwner,
      to_assigned_to_name: e.toAssignedToName,
      actor_role: e.actorRole,
      audit_reason: e.auditReason,
      phone: e.phone,
      display_name: e.displayName,
      status: e.status,
    }))

    return NextResponse.json({ items, count: items.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Assignment events error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
