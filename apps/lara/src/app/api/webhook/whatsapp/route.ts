/**
 * WhatsApp Cloud API Webhook
 *
 * GET  → verification handshake Meta
 * POST → recebe mensagens, processa com IA, responde
 *
 * Multi-tenant ADR-028 · clinic_id resolvido por request via wa_numbers.
 * ADR-012 · usa Repositories pra todo acesso a leads/conversations/messages.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
import { checkGuard } from '@/lib/guard';
import { generateResponse, getFixedResponse } from '@/services/ai.service';
import { transcribeAudio } from '@/services/transcription.service';
import { createLogger, hashPhone } from '@clinicai/logger';
import { v4 as uuidv4 } from 'uuid';

import { makeRepos } from '@/lib/repos';
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

    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ success: true });
    }

    const hasStatuses = body.entry?.some((e: any) =>
      e.changes?.some((c: any) => c.value?.statuses?.length > 0)
    );
    if (hasStatuses) {
      return NextResponse.json({ success: true });
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value?.messages?.length) continue;

        // Meta payload: phone_number_id identifica numero · multi-tenant ADR-028
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
  const repos = makeRepos(supabase);
  const wa = new WhatsAppCloudService();
  const phone = message.from;
  const pushName = contacts?.[0]?.profile?.name || '';

  // ADR-028: clinic_id por request · NUNCA hardcoded
  const { clinic_id } = await resolveTenantContext(supabase, phoneNumberId);

  // 1. Mark as read
  wa.markAsRead(message.id);

  // 2. Lead + conversation lookup/create/revive via Repositories
  const lead = await resolveLead({ leads: repos.leads, clinic_id, phone, pushName });
  if (!lead) return;

  const conv = await resolveConversation({
    conversations: repos.conversations,
    clinic_id,
    phone,
    lead,
    pushName,
  });
  if (!conv) return;

  // 2.5 Voucher B2B detection (mig 800-07) · se recipient tem voucher recente,
  // marca engaged e ancora resposta em torno do agendamento.
  let voucherContext: {
    voucher_id: string;
    partnership_name: string | null;
    partner_first_name: string | null;
    combo: string | null;
    recipient_first_name: string | null;
    audio_sent_at: string | null;
  } | null = null;
  try {
    const voucher = await repos.b2bVouchers.findRecentByRecipientPhone(clinic_id, phone, 72);
    if (voucher) {
      // Resolve dados da parceria pra contexto
      const { data: partnerRow } = await supabase
        .from('b2b_partnerships')
        .select('name, contact_name')
        .eq('id', voucher.partnershipId)
        .maybeSingle();

      const partnershipName = (partnerRow as { name?: string } | null)?.name ?? null;
      const partnerContactName = (partnerRow as { contact_name?: string } | null)?.contact_name ?? null;

      // first name fallback chain: contact_name -> partnership_name
      const partnerFirstName =
        (partnerContactName || partnershipName || '').split(' ')[0] || null;

      const recipientFirstName = (voucher.recipientName || '').split(' ')[0] || null;

      voucherContext = {
        voucher_id: voucher.id,
        partnership_name: partnershipName,
        partner_first_name: partnerFirstName,
        combo: voucher.combo || null,
        recipient_first_name: recipientFirstName,
        audio_sent_at: voucher.audioSentAt ?? null,
      };

      // Marca engaged · idempotente, RPC so atualiza se state em pending/cold_*
      try {
        await repos.b2bVouchers.markEngaged(voucher.id);
        log.info(
          {
            clinic_id,
            phone_hash: hashPhone(phone),
            voucher_id: voucher.id,
            partnership_id: voucher.partnershipId,
          },
          'voucher.recipient.engaged',
        );
      } catch (markErr) {
        log.warn(
          { clinic_id, phone_hash: hashPhone(phone), err: (markErr as Error)?.message },
          'voucher.mark_engaged.failed',
        );
      }
    }
  } catch (err) {
    log.warn(
      { clinic_id, phone_hash: hashPhone(phone), err: (err as Error)?.message },
      'voucher.lookup.failed',
    );
  }

  // 3. Extract content from Meta payload
  const extracted = extractContent(message);
  const contentType = extracted.contentType;
  const mediaId = extracted.mediaId;
  let textContent = extracted.textContent;
  let mediaUrl: string | null = null;
  let leadFunnel: string | null = lead.funnel;

  // 4.5 Auto-detect funnel · sobrescreve só quando atual e generico/null
  if (shouldOverrideFunnel(leadFunnel)) {
    const detected = detectFunnel(textContent);
    if (detected) {
      await repos.leads.setFunnel(lead.id, detected);
      leadFunnel = detected;
      log.info({ clinic_id, phone_hash: hashPhone(phone), funnel: detected, source: 'text' }, 'funnel.detected');
    }
  }

  // 5. Download/upload media · transcrição se áudio
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

            // Re-roda detecção sobre texto transcrito
            if (shouldOverrideFunnel(leadFunnel)) {
              const detected = detectFunnel(transcription);
              if (detected) {
                await repos.leads.setFunnel(lead.id, detected);
                leadFunnel = detected;
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

  // 5.5 Dedup soft · Meta retry · 60s window
  if (await repos.messages.findRecentDuplicate(conv.id, textContent)) {
    log.debug({ clinic_id, phone_hash: hashPhone(phone) }, 'webhook.duplicate.ignored');
    return;
  }

  // 6. Save inbound
  const sentAtStr = new Date().toISOString();
  const inboundId = await repos.messages.saveInbound(clinic_id, {
    conversationId: conv.id,
    phone,
    content: textContent,
    contentType,
    mediaUrl,
    sentAt: sentAtStr,
  });
  if (!inboundId) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'message.inbound.save.failed');
  }

  await repos.conversations.updateLastMessage(conv.id, textContent, true, sentAtStr);

  // 6.5 DEBOUNCE 5s · agrupa fotos/áudios disparados juntos
  await new Promise((resolve) => setTimeout(resolve, 5000));

  if (await repos.messages.hasInboundAfter(conv.id, sentAtStr)) {
    log.debug({ clinic_id, phone_hash: hashPhone(phone) }, 'debounce.skipped.intermediate');
    return;
  }

  // 7. Guard
  const guard = await checkGuard(conv.id);
  if (!guard.allowed) {
    log.info({ clinic_id, phone_hash: hashPhone(phone), reason: guard.reason }, 'guard.blocked');
    return;
  }

  // 8. Count inbound · selector de fixed responses
  const currentMsgCount = await repos.messages.countInbound(conv.id);

  // 9. Fixed responses · zero tokens
  const firstName = (lead.name || pushName || '').split(' ')[0];
  const fixedResponse = getFixedResponse(currentMsgCount - 1, firstName, leadFunnel ?? undefined);

  let aiResponse: string;

  if (fixedResponse) {
    aiResponse = fixedResponse;
  } else {
    // 10. History + Claude
    const messages = await repos.messages.getHistoryForAI(conv.id, 30);

    // Fallback critico · se DB vazio (trigger broke?), forca user msg pra Anthropic nao 500
    if (messages.length === 0 && textContent) {
      messages.push({ role: 'user', content: textContent });
    }

    log.debug({
      clinic_id,
      phone_hash: hashPhone(phone),
      lead_name: lead.name || pushName,
      funnel: leadFunnel || null,
      msg_count: currentMsgCount,
    }, 'ai.call.start');

    aiResponse = await generateResponse(
      {
        name: lead.name || pushName,
        phone,
        queixas_faciais: lead.queixasFaciais,
        idade: lead.idade != null ? String(lead.idade) : undefined,
        phase: lead.phase,
        temperature: lead.temperature ?? undefined,
        day_bucket: lead.dayBucket ?? undefined,
        lead_score: lead.leadScore,
        ai_persona: lead.aiPersona ?? undefined,
        funnel: leadFunnel ?? undefined,
        last_response_at: lead.lastResponseAt ?? undefined,
        is_returning: false,
        message_count: currentMsgCount,
        conversation_count: 1,
        is_audio_message: isAudioMessage,
        clinic_id,
        is_voucher_recipient: voucherContext !== null,
        voucher: voucherContext ?? undefined,
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

  // 10.5 Human handoff · pausa IA 24h
  if (hasHandoffTag(aiResponse)) {
    aiResponse = stripHandoffTag(aiResponse);

    const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await repos.conversations.updateAiPause(conv.id, {
      pausedUntil: pauseUntil,
      aiEnabled: false,
      pausedBy: 'human_handoff',
    });

    try {
      await repos.inboxNotifications.create({
        clinicId: clinic_id,
        conversationId: conv.id,
        source: 'lara',
        reason: 'transbordo_humano',
        payload: {
          phone,
          lead_name: lead.name,
          lead_id: lead.id,
          funnel: leadFunnel,
          message_preview: textContent?.slice(0, 120) || '',
        },
      });
    } catch (notifErr) {
      log.warn({ clinic_id, phone_hash: hashPhone(phone), err: (notifErr as Error)?.message }, 'inbox_notification.failed');
    }

    log.info({ clinic_id, phone_hash: hashPhone(phone) }, 'handoff.activated');
  }

  // 10.5.5 Score / Tags / Funnel · parsers extraidos
  const scoreParsed = parseScore(aiResponse);
  if (scoreParsed.newScore !== null) {
    aiResponse = scoreParsed.textCleaned;
    await repos.leads.updateScore(lead.id, scoreParsed.newScore);
    log.info({ clinic_id, phone_hash: hashPhone(phone), score: scoreParsed.newScore }, 'lead.score.updated');
  }

  const tagsParsed = parseTags(aiResponse);
  if (tagsParsed.tags.length > 0) {
    aiResponse = tagsParsed.textCleaned;
    const finalTags = await repos.leads.addTags(lead.id, tagsParsed.tags);
    const newlyAdded = tagsParsed.tags.filter((t) => finalTags.includes(t));
    for (const tag of newlyAdded) {
      log.info({ clinic_id, phone_hash: hashPhone(phone), tag }, 'lead.tag.added');
    }
  }

  const funnelParsed = parseFunnel(aiResponse);
  if (funnelParsed.newFunnel) {
    aiResponse = funnelParsed.textCleaned;
    await repos.leads.setFunnel(lead.id, funnelParsed.newFunnel);
    leadFunnel = funnelParsed.newFunnel;
    log.info({ clinic_id, phone_hash: hashPhone(phone), funnel: funnelParsed.newFunnel, source: 'ai' }, 'funnel.updated');
  }

  // 10.6 Auto-dispatch midias ricas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendResult: any = { ok: false };
  let outboundContentType: 'text' | 'image' = 'text';
  let outboundMediaUrl: string | null = null;

  const media = await resolveMediaDispatch({
    supabase,
    clinic_id,
    phone,
    aiResponse,
    leadFunnel,
  });

  if (media.photoUrl) {
    aiResponse = media.textCleaned;
    sendResult = await wa.sendImage(phone, media.photoUrl, aiResponse);
    outboundContentType = 'image';
    outboundMediaUrl = media.photoUrl;
  } else {
    aiResponse = media.textCleaned;
    sendResult = await wa.sendText(phone, aiResponse);
  }

  // 12. Save outbound
  await repos.messages.saveOutbound(clinic_id, {
    conversationId: conv.id,
    sender: 'lara',
    content: aiResponse,
    contentType: outboundContentType,
    mediaUrl: outboundMediaUrl,
    status: sendResult.ok ? 'sent' : 'failed',
  });

  await repos.leads.updateLastResponseAt(lead.id);

  log.info({ clinic_id, phone_hash: hashPhone(phone), chars: aiResponse.length, ok: sendResult.ok }, 'ai.response.sent');
}
