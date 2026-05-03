/**
 * POST /api/dra/questions/[id]/answer
 *  Body: { final_answer }
 *  Dra. responde a pergunta · marca status='answered' + dispara notif pra secretaria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/dra/questions/[id]/answer
 *  Body: { status: 'used' | 'discarded' }
 *  Secretaria marca o destino da resposta (usou ou descartou).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const status = String(body?.status || '');
    if (status !== 'used' && status !== 'discarded') {
      return NextResponse.json({ error: 'status invalido' }, { status: 400 });
    }
    const { ctx } = await loadServerReposContext();
    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('conversation_questions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', ctx.clinic_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const finalAnswer = String(body?.final_answer || '').trim();
    if (!finalAnswer) {
      return NextResponse.json({ error: 'final_answer obrigatorio' }, { status: 400 });
    }

    const { ctx, repos } = await loadServerReposContext();
    if (!can(ctx.role, 'lara:edit-config')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('conversation_questions')
      .update({
        final_answer: finalAnswer,
        answered_at: new Date().toISOString(),
        answered_by: ctx.user_id ?? null,
        status: 'answered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('clinic_id', ctx.clinic_id)
      .select()
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'not_found' }, { status: 404 });
    }

    // Notify · sino da secretaria
    try {
      await repos.inboxNotifications.create({
        clinicId: ctx.clinic_id,
        conversationId: data.conversation_id,
        source: 'system',
        reason: 'doctor_answered',
        payload: {
          kind: 'doctor_answered',
          question_id: id,
          answer_preview: finalAnswer.slice(0, 100),
        },
      });
    } catch {
      /* silencioso */
    }

    return NextResponse.json({ ok: true, id, status: 'answered' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}
