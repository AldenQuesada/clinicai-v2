/**
 * GET  /api/conversations/[id]/messages — Fetch messages for a conversation
 * POST /api/conversations/[id]/messages — Send manual message (human agent)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: messages, error } = await supabase
    .from('wa_messages')
    .select('*')
    .eq('conversation_id', id)
    .order('sent_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(messages || []);
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

  const supabase = createServerClient();
  const wa = new WhatsAppCloudService();

  // Resolve phone + clinic_id da conversation · clinic_id NUNCA literal (regra GOLD #1)
  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('phone, clinic_id')
    .eq('id', id)
    .single();

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Save to DB first
  const msgId = uuidv4();
  await supabase.from('wa_messages').insert({
    id: msgId,
    clinic_id: conv.clinic_id,
    conversation_id: id,
    direction: 'outbound',
    sender: 'humano',
    content: content.trim(),
    content_type: 'text',
    status: 'pending',
    sent_at: new Date().toISOString(),
  });

  // Send via WhatsApp Cloud API
  const result = await wa.sendText(conv.phone, content.trim());

  // Update message status
  await supabase
    .from('wa_messages')
    .update({ status: result.ok ? 'sent' : 'failed' })
    .eq('id', msgId);

  // Auto-pause agent when human sends manual message
  let autoPauseActivated = false;
  await supabase
    .from('wa_conversations')
    .update({
      ai_enabled: false,
      ai_paused_until: new Date(Date.now() + 30 * 60000).toISOString(), // 30 min pause
      last_message_at: new Date().toISOString(),
      last_message_text: content.trim().substring(0, 200),
    })
    .eq('id', id);
  autoPauseActivated = true;

  return NextResponse.json({
    ok: true,
    message_id: msgId,
    whatsappStatus: result.ok ? 'sent' : 'error',
    whatsappError: result.ok ? null : result.error,
    autoPauseActivated,
  });
}
