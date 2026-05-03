/**
 * POST /api/conversations/[id]/handoff-secretaria
 *
 * Atendente clica "Passar pra Secretaria" no painel direito · marca handoff
 * atomicamente (pausa Lara 30d + cria inbox_notification kind=handoff_secretaria).
 *
 * Mig 91 · RPC wa_conversation_handoff_secretaria SECURITY DEFINER + clinic
 * ownership check via auth.uid() vs _sdr_clinic_id.
 *
 * ADR-012: chamada via ConversationRepository.handoffSecretaria.
 * ADR-028: clinic_id resolvido dentro da RPC (cross-check com auth context).
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
    const reason = typeof body?.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 200)
      : undefined;

    const { repos } = await loadServerReposContext();
    const result = await repos.conversations.handoffSecretaria(id, reason);

    if (!result.ok) {
      const status =
        result.error === 'conversation_not_found' ? 404
        : result.error === 'forbidden' ? 403
        : 500;
      return NextResponse.json(
        { ok: false, error: result.error ?? 'handoff_failed' },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      already_handed_off: result.alreadyHandedOff ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Handoff secretaria error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
