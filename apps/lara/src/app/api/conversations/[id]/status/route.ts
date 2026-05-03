/**
 * PATCH /api/conversations/[id]/status · muda status da conversa.
 * ADR-012 · ConversationRepository.setStatus.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { createServerClient } from '@/lib/supabase';

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

  // Auth · valida JWT + clinic_id ANTES de usar service_role pra escrita.
  // Tabela wa_conversations · authenticated NÃO tem UPDATE (RLS hardened) ·
  // service_role bypassa RLS, mas filtramos manualmente por clinic_id pra
  // manter scope multi-tenant ADR-028.
  const { ctx } = await loadServerContext();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = createServerClient() as any;
  const { error } = await sb
    .from('wa_conversations')
    .update({ status: status as AllowedStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
