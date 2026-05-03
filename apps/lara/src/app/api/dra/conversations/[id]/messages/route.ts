/**
 * GET /api/dra/conversations/[id]/messages
 *
 * Read-only · retorna histórico da conversa pra Dra. Mirian ler enquanto
 * decide a resposta da pergunta da secretaria. ESPELHO da conv · zero
 * mutação · zero envio pra paciente.
 *
 * Mecanismo de segurança:
 *   - Gated em can(role, 'lara:edit-config') · owner/admin (Dra é owner)
 *   - Apenas SELECT em wa_messages
 *   - Garante que conv pertence à clínica do JWT (multi-tenant ADR-028)
 *   - Nenhum endpoint de POST/PATCH liga conv ↔ Dra · ela só responde a
 *     pergunta interna (PATCH /api/dra/questions/[id]/answer)
 */

import { NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { can } from '@/lib/permissions';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { ctx } = await loadServerReposContext();
    if (!can(ctx.role, 'lara:edit-config')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { supabase, ctx: ctx2 } = await loadServerContext();

    // Confere que conv pertence à clinic_id do JWT (ADR-028)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conv, error: convErr } = await (supabase as any)
      .from('wa_conversations')
      .select('id, clinic_id, phone, lead_id, display_name, last_message_at')
      .eq('id', id)
      .maybeSingle();
    if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
    if (!conv || conv.clinic_id !== ctx2.clinic_id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Lead info pra header (nome/phone)
    let leadName: string | null = null;
    if (conv.lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead } = await (supabase as any)
        .from('leads')
        .select('name, phone')
        .eq('id', conv.lead_id)
        .maybeSingle();
      leadName = lead?.name ?? null;
    }

    // Histórico · últimas 100 msgs em ordem cronológica
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: msgs, error: msgsErr } = await (supabase as any)
      .from('wa_messages')
      .select(
        'id, direction, sender, content, content_type, status, sent_at, media_url',
      )
      .eq('conversation_id', id)
      .order('sent_at', { ascending: false })
      .limit(100);

    if (msgsErr) return NextResponse.json({ error: msgsErr.message }, { status: 500 });

    return NextResponse.json({
      conversation: {
        id: conv.id,
        phone: conv.phone,
        lead_name: leadName ?? conv.display_name ?? null,
        last_message_at: conv.last_message_at,
      },
      // Reverte pra ordem cronológica (mais antiga → mais recente)
      messages: ((msgs ?? []) as unknown[]).slice().reverse(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}
