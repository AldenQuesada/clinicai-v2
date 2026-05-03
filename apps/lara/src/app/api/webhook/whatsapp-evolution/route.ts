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
import { EvolutionService } from '@clinicai/whatsapp';
import { v4 as uuidv4 } from 'uuid';
import { makeRepos } from '@/lib/repos';
import {
  resolveLead,
  resolveConversation,
} from '@/lib/webhook/lead-conversation';
import { transcribeAudio } from '@/services/transcription.service';

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
  // Auth · shared secret (Evolution nao carrega JWT Supabase).
  // Aceita WA_INBOUND_SECRET (canonical) OU LARA_WA_INBOUND_SECRET (fallback
  // pra cobrir bugs de naming em painel de deploy).
  const expected =
    process.env.WA_INBOUND_SECRET ||
    process.env.LARA_WA_INBOUND_SECRET ||
    '';
  if (!expected) {
    log.error(
      {
        has_wa_inbound: !!process.env.WA_INBOUND_SECRET,
        has_lara_wa_inbound: !!process.env.LARA_WA_INBOUND_SECRET,
      },
      'webhook_evolution.misconfig · WA_INBOUND_SECRET ausente em runtime',
    );
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

  // Resolve credenciais Evolution pra essa instance (Mih)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: waRow } = await (supabase as any)
    .from('wa_numbers')
    .select('api_url, api_key, instance_id')
    .eq('id', wa_number_id)
    .maybeSingle();

  // Extract content + tipo · text/audio/image/video/sticker/document
  const msg = data?.message ?? {};
  const msgRec = msg as Record<string, unknown>;
  const audioMsg = msgRec.audioMessage;
  const imageMsg = msgRec.imageMessage;
  const videoMsg = msgRec.videoMessage;
  const stickerMsg = msgRec.stickerMessage;
  const documentMsg = msgRec.documentMessage;

  let content: string =
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    '';

  let contentType = 'text';
  let needsDownload = false;
  if (audioMsg) {
    contentType = 'audio';
    if (!content) content = '[audio recebido]';
    needsDownload = true;
  } else if (imageMsg) {
    contentType = 'image';
    if (!content) content = '[imagem recebida]';
    needsDownload = true;
  } else if (videoMsg) {
    contentType = 'video';
    if (!content) content = '[video recebido]';
    needsDownload = true;
  } else if (stickerMsg) {
    contentType = 'sticker';
    content = '[sticker recebido]';
    needsDownload = true;
  } else if (documentMsg) {
    contentType = 'document';
    content = '[documento recebido]';
    needsDownload = true;
  }

  if (!content) {
    return NextResponse.json({ ok: true, skip: 'empty_message' });
  }

  const pushName = data?.pushName || '';
  const repos = makeRepos(supabase);

  // Download da midia · Evolution baixa decriptado via /chat/getBase64FromMediaMessage
  // Upload pra Storage Supabase · gera public URL pro chat renderizar
  let mediaUrl: string | null = null;
  if (needsDownload && waRow?.api_url && waRow?.api_key && waRow?.instance_id) {
    try {
      const evo = new EvolutionService({
        apiUrl: String(waRow.api_url),
        apiKey: String(waRow.api_key),
        instance: String(waRow.instance_id),
      });
      const dl = await evo.downloadMedia({
        remoteJid: key.remoteJid,
        fromMe: false,
        id: key.id,
      } as Record<string, unknown>);
      if (dl) {
        const ext =
          dl.contentType.includes('audio') ? (dl.contentType.includes('mpeg') ? 'mp3' : 'ogg')
          : dl.contentType.includes('image/png') ? 'png'
          : dl.contentType.includes('image') ? 'jpg'
          : dl.contentType.includes('video/mp4') ? 'mp4'
          : dl.contentType.includes('video') ? 'mp4'
          : dl.contentType.includes('pdf') ? 'pdf'
          : 'bin';
        const storagePath = `wa-evolution-inbound/${clinic_id}/${uuidv4()}.${ext}`;
        const { data: upData, error: upErr } = await supabase.storage
          .from('media')
          .upload(storagePath, dl.buffer, {
            contentType: dl.contentType,
            upsert: false,
          });
        if (upErr || !upData) {
          log.warn(
            { instance, err: upErr?.message, contentType: dl.contentType },
            'webhook_evolution.media.upload_failed',
          );
        } else {
          const { data: pub } = supabase.storage.from('media').getPublicUrl(storagePath);
          mediaUrl = pub.publicUrl;
          log.info(
            { instance, contentType: dl.contentType, ext, bytes: dl.buffer.length },
            'webhook_evolution.media.uploaded',
          );
        }

        // Transcricao automatica de audio · secretaria le texto rapido
        // sem precisar dar play. Mantem mediaUrl pro player tambem (quem
        // quiser escutar). Groq Whisper · custo baixo (~$0.0004/min).
        if (contentType === 'audio') {
          try {
            const transcript = await transcribeAudio(
              dl.buffer,
              dl.contentType,
              `audio.${dl.contentType.includes('mpeg') ? 'mp3' : 'ogg'}`,
            );
            if (transcript && transcript.trim().length > 0) {
              content = transcript.trim();
              log.info(
                { instance, chars: content.length },
                'webhook_evolution.audio.transcribed',
              );
            }
          } catch (err) {
            log.warn(
              { instance, err: (err as Error)?.message },
              'webhook_evolution.audio.transcribe_failed',
            );
          }
        }
      } else {
        log.warn({ instance, contentType }, 'webhook_evolution.media.download_failed');
      }
    } catch (err) {
      log.error(
        { instance, err: (err as Error)?.message, contentType },
        'webhook_evolution.media.exception',
      );
    }
  }

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
  const insertedId = await repos.messages.saveInbound(clinic_id, {
    conversationId: conv.id,
    phone,
    content,
    contentType,
    mediaUrl,
    sentAt: sentAtStr,
  });
  if (!insertedId) {
    log.error(
      { clinic_id, conv_id: conv.id, contentType, contentPreview: content.slice(0, 60) },
      'webhook_evolution.save_inbound_failed · skipping updateLastMessage to avoid orphan preview',
    );
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }
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
