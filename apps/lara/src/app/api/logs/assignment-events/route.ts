/**
 * GET /api/logs/assignment-events
 *
 * Log global de transferencias WhatsApp da clinica · alimenta pagina futura
 * de Logs de Transferencias (UI nao implementada neste patch). Le da view
 * public.wa_conversation_assignment_events_view (Mig 148 + grants 149).
 *
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 *
 * Query params (todos opcionais):
 *   ?limit=N                · default 50 · cap 200
 *   ?action=assigned|returned|reassigned|profile_changed|updated
 *   ?fromOwner=secretaria|alden|mirian|luciana|responsavel
 *   ?toOwner=...
 *   ?actorRole=owner|receptionist|...
 *   ?q=texto                · busca em display_name e phone (ilike)
 *   ?includeTechnical=true  · default false · exclui profile_changed
 *   ?dateFrom=ISO           · audit_at >= dateFrom
 *   ?dateTo=ISO             · audit_at <= dateTo
 *
 * Resposta:
 *   { count, items: [...] }
 *
 * NAO expoe audit_id · old_data · new_data · changed_fields.
 * conversation_id incluido pra navegacao futura (UI clica → abre conv).
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function GET(request: NextRequest) {
  try {
    const { ctx, repos } = await loadServerReposContext()

    const { searchParams } = new URL(request.url)
    const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT))

    const includeTechnical = searchParams.get('includeTechnical') === 'true'

    const events = await repos.conversations.getAssignmentEventsLog(ctx.clinic_id, {
      limit,
      action: searchParams.get('action'),
      fromOwner: searchParams.get('fromOwner'),
      toOwner: searchParams.get('toOwner'),
      actorRole: searchParams.get('actorRole'),
      q: searchParams.get('q'),
      includeTechnical,
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    })

    // Mapeia DTO camelCase → snake_case JSON (padrao das APIs view-derived ·
    // mesmo padrao de /api/conversations/[id]/assignment-events).
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
      conversation_id: e.conversationId,
    }))

    return NextResponse.json({ count: items.length, items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Logs assignment-events error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
