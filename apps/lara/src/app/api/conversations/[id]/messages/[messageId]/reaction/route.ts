/**
 * POST /api/conversations/[id]/messages/[messageId]/reaction
 *
 * React A (2026-05-07) · atendente reage a mensagem com emoji.
 *
 * Body:
 *   { emoji: '👍' }      · adiciona/troca reação
 *   { emoji: null }      · remove reação
 *   { emoji: '' }        · idem (string vazia equivale a null)
 *
 * Validações:
 *   1. Conversation existe e clinic_id match (cross-tenant guard)
 *   2. Target message existe (`getById`)
 *   3. target.conversationId === id (URL param)
 *   4. target.clinicId === ctx.clinic_id
 *   5. target.providerMsgId existe (precisa wamid/key.id pra reagir na rede)
 *   6. emoji é string ≤ 32 chars OU null OU ''
 *
 * Fluxo:
 *   1. Validações
 *   2. Resolve provider (Cloud OU Evolution) via wa_numbers da conv
 *   3. Provider.sendReaction → wamid/key.id da reação
 *   4. SE provider OK → MessageRepository.updateReaction (UPDATE wa_messages.reaction)
 *   5. Retorna { ok, reaction }
 *
 * Se provider falhar · DB NÃO é atualizado · UI re-renderiza estado correto
 * via re-fetch (polling/SSE).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { resolveProviderForConv } from '@/lib/whatsapp/resolve-provider';

export const dynamic = 'force-dynamic';

const MAX_EMOJI_LENGTH = 32;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;
  const body = await request.json().catch(() => ({}));
  const rawEmoji = body?.emoji;

  // Normaliza emoji · null/'' = remover · string trim + cap de length.
  let emoji: string | null = null;
  if (rawEmoji !== null && rawEmoji !== undefined && rawEmoji !== '') {
    if (typeof rawEmoji !== 'string') {
      return NextResponse.json({ error: 'invalid_reaction_emoji' }, { status: 422 });
    }
    const trimmed = rawEmoji.trim();
    if (trimmed.length === 0) {
      emoji = null; // trim virou vazio · remover
    } else if (trimmed.length > MAX_EMOJI_LENGTH) {
      return NextResponse.json({ error: 'invalid_reaction_emoji' }, { status: 422 });
    } else {
      emoji = trimmed;
    }
  }

  // Auth · igual outros endpoints da pasta.
  const { ctx } = await loadServerContext();
  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  if (conv.clinicId !== ctx.clinic_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const target = await repos.messages.getById(messageId);
  if (!target) {
    return NextResponse.json({ error: 'invalid_reaction_target' }, { status: 422 });
  }
  if (target.conversationId !== id) {
    return NextResponse.json(
      { error: 'invalid_reaction_target_conversation' },
      { status: 422 },
    );
  }
  if (target.clinicId !== ctx.clinic_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!target.providerMsgId) {
    return NextResponse.json(
      { error: 'reaction_target_no_provider_id' },
      { status: 422 },
    );
  }

  // Resolve provider · helper compartilhado · Cloud OU Evolution.
  const { provider: wa } = await resolveProviderForConv(supabase, {
    id: conv.id,
    clinicId: conv.clinicId,
    waNumberId: conv.waNumberId,
  });

  if (typeof wa.sendReaction !== 'function') {
    return NextResponse.json(
      { error: 'provider_does_not_support_reaction' },
      { status: 501 },
    );
  }

  // Monta target · remoteJid pra Evolution · fromMe derivado de direction.
  const remoteJid =
    conv.remoteJid && conv.remoteJid.length > 0
      ? conv.remoteJid
      : `${conv.phone}@s.whatsapp.net`;
  const fromMe = target.direction === 'outbound';

  const sendRes = await wa.sendReaction(
    conv.phone,
    {
      providerMsgId: target.providerMsgId,
      remoteJid,
      fromMe,
    },
    emoji,
  );

  if (!sendRes.ok) {
    // Provider rejeitou · DB intacto · UI re-fetch mostra estado correto.
    return NextResponse.json(
      {
        ok: false,
        error: 'reaction_send_failed',
        whatsappError:
          typeof sendRes.error === 'string' ? sendRes.error.slice(0, 200) : null,
      },
      { status: 502 },
    );
  }

  // Provider OK · UPDATE in-place · 1:1 com mensagem alvo.
  await repos.messages.updateReaction(target.id, emoji);

  return NextResponse.json({ ok: true, reaction: emoji });
}
