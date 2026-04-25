/**
 * WhatsApp Cloud API Webhook
 *
 * GET  → Verification handshake with Meta
 * POST → Receive inbound messages, process with AI, reply
 *
 * Multi-tenant ADR-028 · clinic_id resolvido por request via
 * wa_numbers_resolve_by_phone_number_id RPC. Fallback pra Mirian se
 * resolve falhar (audit log warn).
 *
 * Phone variants · queries de lookup usam phoneVariants(phone) pra
 * achar conversations/messages legacy salvas com 9 inicial após DDD
 * (Evolution API) vs sem 9 (Meta Cloud).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
import { checkGuard } from '@/lib/guard';
import { generateResponse, getFixedResponse } from '@/services/ai.service';
import { transcribeAudio } from '@/services/transcription.service';
import { phoneVariants } from '@clinicai/utils';
import { createLogger, hashPhone } from '@clinicai/logger';
import { v4 as uuidv4 } from 'uuid';

import { resolveTenantContext } from '@/lib/webhook/tenant-resolve';
import { detectFunnel, shouldOverrideFunnel } from '@/lib/webhook/funnel-detect';
import {
  parseScore,
  parseTags,
  parseFunnel,
  hasHandoffTag,
  stripHandoffTag,
} from '@/lib/webhook/ai-tags-parser';
import { resolveMediaDispatch } from '@/lib/webhook/media-dispatch';
import {
  resolveLead,
  resolveConversation,
  extractContent,
} from '@/lib/webhook/lead-conversation';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

// ── GET: Webhook verification ────────────────────────────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    log.info({ mode }, 'webhook.verified');
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  log.warn({ mode }, 'webhook.verification.failed');
  return new Response('Forbidden', { status: 403 });
}

// ── POST: Inbound message processing ─────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate it's a WhatsApp Business Account event
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ success: true });
    }

    // Process status updates silently
    const hasStatuses = body.entry?.some((e: any) =>
      e.changes?.some((c: any) => c.value?.statuses?.length > 0)
    );
    if (hasStatuses) {
      return NextResponse.json({ success: true });
    }

    // Extract messages
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value?.messages?.length) continue;

        // Meta payload: value.metadata.phone_number_id identifica qual numero
        // recebeu a mensagem · usado pra resolver clinic_id (multi-tenant ADR-028)
        const phoneNumberId = value.metadata?.phone_number_id || null;

        for (const message of value.messages) {
          await processInboundMessage(message, value.contacts, phoneNumberId);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err: (err as Error)?.message, stack: (err as Error)?.stack }, 'webhook.error');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Process a single inbound message ─────────────────────────
async function processInboundMessage(
  message: any,
  contacts: any[],
  phoneNumberId: string | null = null,
) {
  const supabase = createServerClient();
  const wa = new WhatsAppCloudService();
  const phone = message.from;
  const pushName = contacts?.[0]?.profile?.name || '';

  // ADR-028: resolve clinic_id por request via wa_numbers · NUNCA hardcoded
  const { clinic_id } = await resolveTenantContext(supabase, phoneNumberId);

  // 1. Mark as read immediately
  wa.markAsRead(message.id);

  // 2. Lead + conversation lookup/create/revive · helpers extraídos
  const lead = await resolveLead({ supabase, clinic_id, phone, pushName });
  if (!lead) return;

  const conv = await resolveConversation({ supabase, clinic_id, phone, lead, pushName });
  if (!conv) return;

  // 3. Extract content from Meta payload · text/image/audio/video/sticker
  const extracted = extractContent(message);
  const contentType = extracted.contentType;
  const mediaId = extracted.mediaId;
  let textContent = extracted.textContent;
  let mediaUrl: string | null = null;

  // 4.5 Auto-Detect Funnel · só sobrescreve quando atual é genérico/null
  if (lead && shouldOverrideFunnel(lead.funnel)) {
    const detected = detectFunnel(textContent);
    if (detected) {
      await supabase.from('leads').update({ funnel: detected }).eq('id', lead.id);
      lead.funnel = detected;
      log.info({ clinic_id, phone_hash: hashPhone(phone), funnel: detected, source: 'text' }, 'funnel.detected');
    }
  }

  // 5. Download and upload media to Supabase Storage if applicable
  // Para áudio: também transcreve com Groq Whisper e substitui o placeholder
  let isAudioMessage = false;
  if (mediaId) {
    try {
      const mediaData = await wa.downloadMedia(mediaId);
      if (mediaData) {
        const ext = mediaData.contentType.includes('audio') ? 'ogg'
          : mediaData.contentType.includes('image') ? 'jpg'
          : mediaData.contentType.includes('video') ? 'mp4'
          : 'bin';
        const storagePath = `wa-media/${conv.id}/${uuidv4()}.${ext}`;

        const { data: uploadData } = await supabase.storage
          .from('media')
          .upload(storagePath, mediaData.buffer, {
            contentType: mediaData.contentType,
            upsert: false,
          });

        if (uploadData) {
          const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
          mediaUrl = urlData?.publicUrl || null;
        }

        // 5.1 Transcrição de Áudio (Groq Whisper)
        if (contentType === 'audio') {
          isAudioMessage = true;
          log.debug({ clinic_id, phone_hash: hashPhone(phone) }, 'transcription.start');
          const transcription = await transcribeAudio(
            mediaData.buffer,
            mediaData.contentType,
            `audio.${ext}`
          );

          if (transcription) {
            textContent = transcription;
            log.debug({ clinic_id, phone_hash: hashPhone(phone), chars: transcription.length }, 'transcription.done');

            // 5.2 Re-rodar detecção de funil sobre o texto transcrito
            // (passo 4.5 não conseguiu porque textContent ainda era placeholder)
            if (lead && shouldOverrideFunnel(lead.funnel)) {
              const detected = detectFunnel(transcription);
              if (detected) {
                await supabase.from('leads').update({ funnel: detected }).eq('id', lead.id);
                lead.funnel = detected;
                log.info({ clinic_id, phone_hash: hashPhone(phone), funnel: detected, source: 'audio' }, 'funnel.detected');
              }
            }
          } else {
            textContent = '[áudio recebido — transcrição indisponível]';
            log.warn({ clinic_id, phone_hash: hashPhone(phone) }, 'transcription.failed');
          }
        }
      }
    } catch (err) {
      log.error({ clinic_id, phone_hash: hashPhone(phone), err: (err as Error)?.message }, 'media.download_or_transcription.failed');
    }
  }

  // 5.5 Deduplicação suave (Caso a Meta envie retry, ignoramos mensagens idênticas nos últimos 60s)
  const { data: duplicateMsg } = await supabase
    .from('wa_messages')
    .select('id')
    .eq('conversation_id', conv.id)
    .eq('content', textContent)
    .gte('sent_at', new Date(Date.now() - 60000).toISOString())
    .maybeSingle();

  if (duplicateMsg) {
    log.debug({ clinic_id, phone_hash: hashPhone(phone) }, 'webhook.duplicate.ignored');
    return;
  }

  // 6. Save inbound message to DB
  const sentAtStr = new Date().toISOString();
  const { error: msgErr } = await supabase.from('wa_messages').insert({
    id: uuidv4(),
    clinic_id,
    conversation_id: conv.id,
    phone: phone, // Passando o telefone explicitamente pro Trigger não chorar
    direction: 'inbound',
    sender: 'user',
    content: textContent,
    content_type: contentType,
    media_url: mediaUrl,
    status: 'received',
    sent_at: sentAtStr,
  });
  if (msgErr) {
    log.error({ clinic_id, phone_hash: hashPhone(phone), err: msgErr.message }, 'message.inbound.save.failed');
  }

  // Update conversation last message
  await supabase
    .from('wa_conversations')
    .update({
      last_message_at: sentAtStr,
      last_message_text: textContent.substring(0, 200),
      last_lead_msg: sentAtStr,
    })
    .eq('id', conv.id);

  // 6.5 DEBOUNCE (Smart Delay)
  // Aguarda 5 segundos agrupando digitação rápida do paciente (ou 2+ fotos soltas).
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Verifica se chegou uma nova mensagem no banco nesse intervalo
  const { data: latestMsg } = await supabase
    .from('wa_messages')
    .select('sent_at')
    .eq('conversation_id', conv.id)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  if (latestMsg && new Date(latestMsg.sent_at).getTime() > new Date(sentAtStr).getTime() + 10) {
    log.debug({ clinic_id, phone_hash: hashPhone(phone) }, 'debounce.skipped.intermediate');
    return;
  }

  // 7. Check guard — AI allowed to respond?
  const guard = await checkGuard(conv.id);
  if (!guard.allowed) {
    log.info({ clinic_id, phone_hash: hashPhone(phone), reason: guard.reason }, 'guard.blocked');
    return;
  }

  // 8. Count inbound messages for prompt selection
  const { count: inboundMsgCount } = await supabase
    .from('wa_messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conv.id)
    .eq('direction', 'inbound');

  const currentMsgCount = inboundMsgCount || 0;

  // 9. Check for fixed responses (zero tokens)
  const firstName = (lead.name || pushName || '').split(' ')[0];
  const fixedResponse = getFixedResponse(currentMsgCount - 1, firstName, lead.funnel);

  let aiResponse: string;

  if (fixedResponse) {
    aiResponse = fixedResponse;
  } else {
    // 10. Build conversation history and call Claude
    const { data: history } = await supabase
      .from('wa_messages')
      .select('direction, content')
      .eq('conversation_id', conv.id)
      .order('sent_at', { ascending: true })
      .limit(30);

    const messages = (history || []).map((h) => ({
      role: (h.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: h.content,
    }));

    // Fallback de segurança crítica: Se o banco de dados falhou (ex: erro de trigger no wa_messages) 
    // e o array está vazio, forçamos a mensagem atual do usuário pra dentro, assim Anthropic não quebra com 500.
    if (messages.length === 0 && textContent) {
      messages.push({ role: 'user', content: textContent });
    }

    log.debug({
      clinic_id,
      phone_hash: hashPhone(phone),
      lead_name: lead.name || pushName,
      funnel: lead.funnel || null,
      msg_count: currentMsgCount,
    }, 'ai.call.start');

    aiResponse = await generateResponse(
      {
        name: lead.name || pushName,
        phone,
        queixas_faciais: lead.queixas_faciais || [],
        idade: lead.idade,
        phase: lead.phase,
        temperature: lead.temperature,
        day_bucket: lead.day_bucket,
        lead_score: lead.lead_score,
        ai_persona: lead.ai_persona,
        funnel: lead.funnel,
        last_response_at: lead.last_response_at,
        is_returning: false, // Só é paciente retornado se viesse do CRM antigo
        message_count: currentMsgCount,
        conversation_count: 1,
        is_audio_message: isAudioMessage, // Informa à IA que a mensagem veio de um áudio
        clinic_id, // ADR-028 · ai.service usa pra ler prompt overrides do DB
      },
      messages,
      currentMsgCount
    );
    log.debug({
      clinic_id,
      phone_hash: hashPhone(phone),
      response_chars: aiResponse?.length ?? 0,
    }, 'ai.call.done');
  }

  // 10.5 Human HandOff (Pausa Automática)
  if (hasHandoffTag(aiResponse)) {
    aiResponse = stripHandoffTag(aiResponse);

    // Pausa a IA para este lead por 24 horas
    const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('wa_conversations').update({
      ai_paused_until: pauseUntil,
      ai_enabled: false,
      paused_by: 'human_handoff'
    }).eq('id', conv.id);

    // Notifica dashboard antigo via inbox_notifications · sino com badge
    // (RPC criada na migration 847 · clinic-dashboard polling pra exibir)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('inbox_notification_create', {
        p_clinic_id:       clinic_id,
        p_conversation_id: conv.id,
        p_source:          'lara',
        p_reason:          'transbordo_humano',
        p_payload: {
          phone,
          lead_name: lead.name,
          lead_id:   lead.id,
          funnel:    lead.funnel,
          message_preview: textContent?.slice(0, 120) || '',
        },
      });
    } catch (notifErr) {
      log.warn({ clinic_id, phone_hash: hashPhone(phone), err: (notifErr as Error)?.message }, 'inbox_notification.failed');
    }

    log.info({ clinic_id, phone_hash: hashPhone(phone) }, 'handoff.activated');
  }

  // 10.5.5 Score / Tags / Funnel · parsers extraídos pra ai-tags-parser.ts
  const scoreParsed = parseScore(aiResponse);
  if (scoreParsed.newScore !== null) {
    aiResponse = scoreParsed.textCleaned;
    await supabase.from('leads').update({ lead_score: scoreParsed.newScore }).eq('id', lead.id);
    log.info({ clinic_id, phone_hash: hashPhone(phone), score: scoreParsed.newScore }, 'lead.score.updated');
  }

  const tagsParsed = parseTags(aiResponse);
  if (tagsParsed.tags.length > 0) {
    aiResponse = tagsParsed.textCleaned;
    const { data: currentLead } = await supabase.from('leads').select('tags').eq('id', lead.id).single();
    const existingTags: string[] = currentLead?.tags || [];
    const newTags = tagsParsed.tags.filter((t) => !existingTags.includes(t));
    if (newTags.length > 0) {
      await supabase.from('leads').update({ tags: [...existingTags, ...newTags] }).eq('id', lead.id);
      for (const tag of newTags) {
        log.info({ clinic_id, phone_hash: hashPhone(phone), tag }, 'lead.tag.added');
      }
    }
  }

  const funnelParsed = parseFunnel(aiResponse);
  if (funnelParsed.newFunnel) {
    aiResponse = funnelParsed.textCleaned;
    await supabase.from('leads').update({ funnel: funnelParsed.newFunnel }).eq('id', lead.id);
    lead.funnel = funnelParsed.newFunnel;
    log.info({ clinic_id, phone_hash: hashPhone(phone), funnel: funnelParsed.newFunnel, source: 'ai' }, 'funnel.updated');
  }

  // 10.6 Auto-Dispatch Mídias Ricas · helper resolveMediaDispatch (lib/webhook/media-dispatch.ts)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendResult: any = { ok: false };
  let outboundContentType: 'text' | 'image' = 'text';
  let outboundMediaUrl: string | null = null;

  const media = await resolveMediaDispatch({
    supabase,
    clinic_id,
    phone,
    aiResponse,
    leadFunnel: lead.funnel,
  });

  if (media.photoUrl) {
    aiResponse = media.textCleaned;
    sendResult = await wa.sendImage(phone, media.photoUrl, aiResponse);
    outboundContentType = 'image';
    outboundMediaUrl = media.photoUrl;
  } else {
    // Sem foto · só texto (limpa tag se chegou aqui)
    aiResponse = media.textCleaned;
    sendResult = await wa.sendText(phone, aiResponse);
  }

  // 12. Save outbound message to DB
  await supabase.from('wa_messages').insert({
    id: uuidv4(),
    clinic_id,
    conversation_id: conv.id,
    direction: 'outbound',
    sender: 'lara',
    content: aiResponse,
    content_type: outboundContentType,
    media_url: outboundMediaUrl,
    status: sendResult.ok ? 'sent' : 'failed',
    sent_at: new Date().toISOString(),
  });

  // Update lead's last response
  await supabase
    .from('leads')
    .update({ last_response_at: new Date().toISOString() })
    .eq('id', lead.id);

  log.info({ clinic_id, phone_hash: hashPhone(phone), chars: aiResponse.length, ok: sendResult.ok }, 'ai.response.sent');
}
