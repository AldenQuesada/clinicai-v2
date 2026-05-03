/**
 * GET /api/secretaria/dra-pending
 *
 * Retorna contagem + lista de conversation_ids com perguntas pendentes
 * pra Dra. Mirian. Usado pelo KPI "Dra" no /secretaria pra:
 *   - mostrar badge com count
 *   - filtrar lista de conversas pra apenas as que tem pergunta pendente
 *
 * Acesso: qualquer usuário do clinic (multi-tenant scope via JWT).
 */

import { NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, ctx } = await loadServerContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('conversation_questions')
      .select('conversation_id')
      .eq('clinic_id', ctx.clinic_id)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const conversationIds = Array.from(
      new Set(((data ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id)),
    );

    return NextResponse.json({
      count: conversationIds.length,
      conversation_ids: conversationIds,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}
