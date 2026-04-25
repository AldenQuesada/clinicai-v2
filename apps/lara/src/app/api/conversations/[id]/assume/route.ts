/**
 * POST   /api/conversations/[id]/assume · humano assume controle (pausa IA 30min)
 * DELETE /api/conversations/[id]/assume · libera de volta pra IA
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
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
  const { supabase } = await loadServerContext();
  const repos = makeRepos(supabase);

  await repos.conversations.updateAiPause(id, {
    pausedUntil: null,
    aiEnabled: true,
    status: 'active',
  });

  return NextResponse.json({ ok: true });
}
