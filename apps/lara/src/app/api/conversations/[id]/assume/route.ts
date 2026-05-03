/**
 * POST   /api/conversations/[id]/assume · humano assume controle (pausa IA 30min)
 * DELETE /api/conversations/[id]/assume · libera de volta pra IA
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { pauseAgent } from '@/lib/guard';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const result = await pauseAgent(id, 30);
    return NextResponse.json({ ok: true, pauseStatus: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Auth · valida JWT antes de service_role pra UPDATE wa_conversations
  // (RLS hardened: authenticated nao tem UPDATE). Filtra por clinic_id
  // manualmente pra preservar scope multi-tenant ADR-028.
  const { ctx } = await loadServerContext();
  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  // Confirma conv pertence à clinic do JWT
  const conv = await repos.conversations.getById(id);
  if (!conv || conv.clinicId !== ctx.clinic_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await repos.conversations.updateAiPause(id, {
    pausedUntil: null,
    aiEnabled: true,
    status: 'active',
  });

  return NextResponse.json({ ok: true });
}
