/**
 * GET  /api/conversations/[id]/messages · lista mensagens
 * POST /api/conversations/[id]/messages · envia manual (humano assume)
 *
 * ADR-012: tudo via Repositories. Multi-tenant ADR-028 via JWT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import {
  WhatsAppCloudService,
  createWhatsAppCloudFromWaNumber,
} from '@clinicai/whatsapp';
import { makeRepos } from '@/lib/repos';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase } = await loadServerContext();
  const repos = makeRepos(supabase);

  const messages = await repos.messages.listByConversation(id, { ascending: true });

  // Mantem shape legado (snake_case) pro frontend que ainda nao migrou
  return NextResponse.json(
    messages.map((m) => ({
      id: m.id,
      clinic_id: m.clinicId,
      conversation_id: m.conversationId,
      phone: m.phone,
      direction: m.direction,
      sender: m.sender,
      content: m.content,
      content_type: m.contentType,
      media_url: m.mediaUrl,
      status: m.status,
      sent_at: m.sentAt,
    })),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { content } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const { supabase } = await loadServerContext();
  const repos = makeRepos(supabase);

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Audit fix N7 (2026-04-27): WhatsApp service per-tenant.
  // Tenta resolver pelo wa_number_id da conversation; fallback pra env global
  // enquanto wa_numbers está sendo populado pra todas clínicas.
  // Camada 3.5 da auditoria CRM: ConversationDTO agora tem waNumberId tipado
  // (antes faltava · `(conv as any).waNumberId` retornava undefined em runtime).
  let wa: WhatsAppCloudService | null = null;
  if (conv.waNumberId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wa = await createWhatsAppCloudFromWaNumber(supabase as any, conv.waNumberId);
  }
  if (!wa) {
    wa = new WhatsAppCloudService({
      wa_number_id: 'fallback-env',
      clinic_id: conv.clinicId,
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    });
  }

  // clinic_id vem da conversation (resolvido no inbound · ADR-028)
  const msgId = uuidv4();
  await repos.messages.saveOutbound(conv.clinicId, {
    id: msgId,
    conversationId: id,
    sender: 'humano',
    content: content.trim(),
    contentType: 'text',
    status: 'pending',
  });

  // Envia via WA Cloud
  const result = await wa.sendText(conv.phone, content.trim());

  await repos.messages.updateStatus(msgId, result.ok ? 'sent' : 'failed');

  // Auto-pause IA quando humano envia · 30 min default
  await repos.conversations.updateAiPause(id, {
    pausedUntil: new Date(Date.now() + 30 * 60000).toISOString(),
    aiEnabled: false,
  });
  await repos.conversations.updateLastMessage(id, content.trim(), false);

  return NextResponse.json({
    ok: true,
    message_id: msgId,
    whatsappStatus: result.ok ? 'sent' : 'error',
    whatsappError: result.ok ? null : result.error,
    autoPauseActivated: true,
  });
}
