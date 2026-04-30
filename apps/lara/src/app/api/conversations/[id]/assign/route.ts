/**
 * POST   /api/conversations/[id]/assign · atribui conversa a um membro
 * DELETE /api/conversations/[id]/assign · libera (unassign)
 *
 * P-12 multi-atendente · Fase 1 (server-side).
 * Doc: docs/audits/2026-04-29-p12-multi-atendente-projeto.html
 *
 * ADR-012: ConversationRepository.assignConversation/unassignConversation.
 * Multi-tenant ADR-028: validacao de clinic_id roda dentro da RPC
 * (wa_conversation_assign · SECURITY DEFINER + app_clinic_id()).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const userId = (body?.user_id ?? '').trim();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'user_id obrigatorio' },
        { status: 400 },
      );
    }

    const { repos } = await loadServerReposContext();
    const result = await repos.conversations.assignConversation(id, userId);

    if (!result.ok) {
      // user_not_in_clinic / conversation_not_found · 403/404 mais semantico
      const status = result.error === 'conversation_not_found' ? 404 : 403;
      return NextResponse.json(
        { ok: false, error: result.error ?? 'assign_failed' },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      assigned_to: result.assignedTo,
      assigned_at: result.assignedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Assign error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { repos } = await loadServerReposContext();
    const result = await repos.conversations.unassignConversation(id);

    if (!result.ok) {
      const status = result.error === 'conversation_not_found' ? 404 : 500;
      return NextResponse.json(
        { ok: false, error: result.error ?? 'unassign_failed' },
        { status },
      );
    }

    return NextResponse.json({ ok: true, assigned_to: null, assigned_at: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Unassign error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
