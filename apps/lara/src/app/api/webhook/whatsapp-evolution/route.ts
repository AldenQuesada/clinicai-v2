/**
 * Webhook Evolution (Mig 91/92) · roteamento ESPECIFICO pra inbox 'secretaria'.
 *
 * Diferente do /api/webhook/whatsapp (Cloud API), este endpoint:
 *   - Aceita Evolution shape (event=messages.upsert, instance, data.key, data.message)
 *   - Resolve wa_number pelo `instance` da Evolution (RPC mig 92)
 *   - SO processa quando inbox_role='secretaria' · outras instances ignora silentemente
 *   - NUNCA roda generateResponse · humano gerencia
 *   - Cria conversation com inbox_role='secretaria' (denorm via trigger mig 91)
 *   - Dispara inbox_notification kind='inbound_secretaria' (sino do dashboard)
 *
 * Auth: header `x-inbound-secret` === env `WA_INBOUND_SECRET` (mesmo da Mira).
 *
 * Configuracao Evolution Mih:
 *   POST https://lara.miriandpaula.com.br/api/webhook/whatsapp-evolution
 *   Header: x-inbound-secret: <WA_INBOUND_SECRET>
 *   Events: messages.upsert
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createLogger, hashPhone } from '@clinicai/logger';
import { makeRepos } from '@/lib/repos';
import {
  resolveLead,
  resolveConversation,
} from '@/lib/webhook/lead-conversation';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

interface EvolutionPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; senderPn?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
      audioMessage?: unknown;
    };
    messageType?: string;
    pushName?: string;
    senderPn?: string;
  };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function POST(request: NextRequest) {
  // Auth · shared secret (Evolution nao carrega JWT Supabase)
  const expected = process.env.WA_INBOUND_SECRET || '';
  if (!expected) {
    log.error({}, 'webhook_evolution.misconfig · WA_INBOUND_SECRET ausente');
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 500 });
  }
  const provided = request.headers.get('x-inbound-secret') || '';
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: EvolutionPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const event = body?.event || '';
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
    return NextResponse.json({ ok: true, skip: 'not_message_event' });
  }

  const instance = body?.instance || '';
  if (!instance) {
    return NextResponse.json({ ok: true, skip: 'no_instance' });
  }

  const data = body?.data ?? {};
  const key = data?.key ?? {};
  if (key?.fromMe) {
    return NextResponse.json({ ok: true, skip: 'outbound' });
  }

  const remoteJid: string = key?.remoteJid || '';
  if (!remoteJid || remoteJid.includes('@g.us')) {
    return NextResponse.json({ ok: true, skip: 'group_or_invalid' });
  }

  // WhatsApp privacy mode (LID) · phone real vai em key.senderPn / data.senderPn
  let phone: string;
  if (remoteJid.endsWith('@lid')) {
    const senderPn = key?.senderPn || data?.senderPn || '';
    phone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (!phone) {
      log.warn({ remoteJid }, 'webhook_evolution.lid_without_senderPn');
      return NextResponse.json({ ok: true, skip: 'lid_without_senderPn' });
    }
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  }

  if (!/^\d{10,15}$/.test(phone)) {
    return NextResponse.json({ ok: true, skip: 'bad_phone', phone });
  }

  // Resolve wa_number pela instance (RPC mig 92)
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resolveRes, error: resolveErr } = await (supabase as any).rpc(
    'wa_numbers_resolve_by_instance',
    { p_instance: instance },
  );
  if (resolveErr || !resolveRes?.ok) {
    log.warn(
      { instance, err: resolveErr?.message ?? resolveRes?.error },
      'webhook_evolution.instance_unresolved',
    );
    return NextResponse.json({ ok: true, skip: 'instance_unresolved', instance });
  }

  const inboxRole = String(resolveRes.inbox_role || 'sdr');
  const clinic_id = String(resolveRes.clinic_id);
  const wa_number_id = String(resolveRes.wa_number_id);

  // Filter · so processa secretaria · evita interferir em legacy flows da Mih
  if (inboxRole !== 'secretaria') {
    return NextResponse.json({
      ok: true,
      skip: 'not_secretaria_inbox',
      instance,
      inbox_role: inboxRole,
    });
  }

  // Extract content · text/extended/image_caption/video_caption/audio
  const msg = data?.message ?? {};
  const audioMsg = (msg as Record<string, unknown>).audioMessage;
  let content: string =
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    '';

  let contentType = 'text';
  if (!content && audioMsg) {
    // Audio nao transcrevemos aqui · atendente humano escuta direto.
    // Salvamos placeholder · UI mostra "audio recebido" e aponta pro arquivo.
    content = '[audio recebido]';
    contentType = 'audio';
  } else if ((msg as Record<string, unknown>).imageMessage) {
    contentType = 'image';
    if (!content) content = '[imagem recebida]';
  } else if ((msg as Record<string, unknown>).videoMessage) {
    contentType = 'video';
    if (!content) content = '[video recebido]';
  } else if ((msg as Record<string, unknown>).stickerMessage) {
    contentType = 'sticker';
    content = '[sticker recebido]';
  } else if ((msg as Record<string, unknown>).documentMessage) {
    contentType = 'document';
    content = '[documento recebido]';
  }

  if (!content) {
    return NextResponse.json({ ok: true, skip: 'empty_message' });
  }

  const pushName = data?.pushName || '';
  const repos = makeRepos(supabase);

  // Lead + conversation com wa_number_id correto (trigger sincroniza inbox_role)
  const lead = await resolveLead({ leads: repos.leads, clinic_id, phone, pushName });
  if (!lead) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'webhook_evolution.lead.create.failed');
    return NextResponse.json({ ok: false, error: 'lead_create_failed' }, { status: 500 });
  }

  const conv = await resolveConversation({
    conversations: repos.conversations,
    clinic_id,
    phone,
    lead,
    pushName,
    waNumberId: wa_number_id,
  });
  if (!conv) {
    return NextResponse.json({ ok: false, error: 'conversation_create_failed' }, { status: 500 });
  }

  // Dedup soft · Evolution retry pode entregar 2x na mesma janela curta
  if (await repos.messages.findRecentDuplicate(conv.id, content)) {
    return NextResponse.json({ ok: true, skip: 'duplicate' });
  }

  const sentAtStr = new Date().toISOString();
  await repos.messages.saveInbound(clinic_id, {
    conversationId: conv.id,
    phone,
    content,
    contentType,
    mediaUrl: null,
    sentAt: sentAtStr,
  });
  await repos.conversations.updateLastMessage(conv.id, content, true, sentAtStr);

  // Notify secretaria inbox
  try {
    await repos.inboxNotifications.create({
      clinicId: clinic_id,
      conversationId: conv.id,
      source: 'system',
      reason: 'inbound_secretaria',
      payload: {
        kind: 'inbound_secretaria',
        transport: 'evolution',
        instance,
        phone,
        lead_id: lead.id,
        lead_name: lead.name,
        message_preview: content.slice(0, 120),
      },
    });
  } catch (err) {
    log.warn(
      { clinic_id, phone_hash: hashPhone(phone), err: (err as Error)?.message },
      'webhook_evolution.notify.failed',
    );
  }

  log.info(
    { clinic_id, phone_hash: hashPhone(phone), instance, conv_id: conv.id },
    'webhook_evolution.secretaria.inbound',
  );
  return NextResponse.json({ ok: true, conversation_id: conv.id });
}

// Evolution faz GET de health check em alguns setups
export async function GET() {
  return NextResponse.json({ ok: true, transport: 'evolution', target: 'secretaria' });
}
