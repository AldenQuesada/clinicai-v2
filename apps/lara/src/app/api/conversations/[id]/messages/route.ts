/**
 * GET  /api/conversations/[id]/messages · lista mensagens
 * POST /api/conversations/[id]/messages · envia manual (humano assume)
 *
 * ADR-012: tudo via Repositories. Multi-tenant ADR-028 via JWT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
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
  const wa = new WhatsAppCloudService();

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
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
