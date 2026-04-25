/**
 * PATCH /api/conversations/[id]/status · muda status da conversa.
 * ADR-012 · ConversationRepository.setStatus.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';

export const dynamic = 'force-dynamic';

const ALLOWED = ['active', 'paused', 'resolved', 'archived', 'dra'] as const;
type AllowedStatus = (typeof ALLOWED)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await request.json();

  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
  }

  const { supabase } = await loadServerContext();
  const repos = makeRepos(supabase);

  await repos.conversations.setStatus(id, status as AllowedStatus);

  return NextResponse.json({ ok: true });
}
