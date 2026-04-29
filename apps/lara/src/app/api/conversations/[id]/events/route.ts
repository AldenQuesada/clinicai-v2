/**
 * GET /api/conversations/[id]/events · timeline de eventos do lead
 * vinculado a essa conversa (SA-07 / W-07).
 *
 * Fonte: phase_history (audit trail imutavel · mig 64). Resolve lead_id
 * via ConversationRepository.getById e delega leitura ao
 * PhaseHistoryRepository.listByLead (ADR-012).
 *
 * Multi-tenant: clinic_id vem do JWT via loadServerReposContext (ADR-028) ·
 * RLS de phase_history filtra por clinic_id automaticamente.
 *
 * Shape do response: array de `{ id, type, from, to, by_user, created_at,
 * meta }` em ordem desc por created_at · cap em 20 entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

interface TimelineEvent {
  id: string;
  type: 'phase_change';
  from: string | null;
  to: string;
  by_user: string | null;
  created_at: string;
  meta: {
    origin: string;
    reason: string | null;
    triggered_by: string | null;
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { repos } = await loadServerReposContext();

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  if (!conv.leadId) {
    // Conversa sem lead vinculado · retorna timeline vazia (UI degrada
    // gracefully · exibe empty state).
    return NextResponse.json({ events: [] satisfies TimelineEvent[] });
  }

  // listByLead retorna ASC · vamos pegar mais e cortar DESC nos 20 mais
  // recentes pra UI de timeline (mais recente no topo).
  const rows = await repos.phaseHistory.listByLead(conv.leadId, { limit: 100 });

  const events: TimelineEvent[] = rows
    .slice() // nao muta retorno do repo
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      type: 'phase_change' as const,
      from: row.fromPhase ?? null,
      to: row.toPhase,
      by_user: row.actorId ?? row.triggeredBy ?? null,
      created_at: row.createdAt,
      meta: {
        origin: row.origin,
        reason: row.reason,
        triggered_by: row.triggeredBy,
      },
    }));

  return NextResponse.json({ events });
}
