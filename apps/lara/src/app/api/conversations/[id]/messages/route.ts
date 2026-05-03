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
  EvolutionService,
  type WhatsAppProvider,
} from '@clinicai/whatsapp';
import { makeRepos } from '@/lib/repos';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mig 91/92 · resolve provider per-tenant baseado no wa_numbers do conv.
 * Lê o row e instancia Cloud OU Evolution conforme phone_number_id/instance_id.
 * Fallback Cloud env-global se conv.waNumberId for null (legacy).
 */
async function resolveProviderForConv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  conv: { id: string; clinicId: string; waNumberId: string | null },
): Promise<{ provider: WhatsAppProvider; transport: 'cloud' | 'evolution' | 'env_fallback' }> {
  if (conv.waNumberId) {
    const { data: row } = await supabase
      .from('wa_numbers')
      .select('id, phone_number_id, access_token, instance_id, api_url, api_key, is_active')
      .eq('id', conv.waNumberId)
      .maybeSingle();

    if (row?.is_active) {
      // Evolution · instance_id presente E api_url/api_key configurados
      if (row.instance_id && row.api_url && row.api_key) {
        return {
          provider: new EvolutionService({
            apiUrl: String(row.api_url),
            apiKey: String(row.api_key),
            instance: String(row.instance_id),
          }),
          transport: 'evolution',
        };
      }
      // Cloud · phone_number_id + access_token
      if (row.phone_number_id && row.access_token) {
        const cloud = await createWhatsAppCloudFromWaNumber(supabase, conv.waNumberId);
        if (cloud) return { provider: cloud, transport: 'cloud' };
      }
    }
  }
  // Fallback · env global (legacy · Lara antiga)
  return {
    provider: new WhatsAppCloudService({
      wa_number_id: 'fallback-env',
      clinic_id: conv.clinicId,
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    }),
    transport: 'env_fallback',
  };
}

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
      // Sprint C · campos novos (undefined se mig 86 nao aplicada)
      internal_note: m.internalNote ?? false,
      delivery_status: m.deliveryStatus ?? null,
    })),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { content, internal, mediaPath, mediaType, mimeType, fileName } = body;

  // P-07 · pelo menos content OU midia
  const hasMedia = !!mediaPath && !!mediaType && !!mimeType;
  if (!content?.trim() && !hasMedia) {
    return NextResponse.json({ error: 'Content ou media obrigatorio' }, { status: 400 });
  }

  const { supabase } = await loadServerContext();
  const repos = makeRepos(supabase);

  const conv = await repos.conversations.getById(id);
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Sprint C · SC-03 (W-11): nota interna · NAO envia ao paciente
  if (internal === true) {
    const noteId = await repos.messages.saveInternalNote(conv.clinicId, {
      conversationId: id,
      content: content?.trim() ?? '',
      sender: 'humano',
    });
    if (!noteId) {
      return NextResponse.json(
        { error: 'Falha ao salvar nota · verifique se mig 86 foi aplicada' },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      message_id: noteId,
      internal_note: true,
    });
  }

  // Mig 91/92 · provider per-tenant · Cloud OU Evolution baseado no wa_numbers
  const { provider: wa, transport } = await resolveProviderForConv(
    supabase,
    { id: conv.id, clinicId: conv.clinicId, waNumberId: conv.waNumberId },
  );

  // ────────────────────────────────────────────────────────────────
  // Branch MIDIA Evolution · sendImage/sendVoice via URL publica do Storage
  // (Evolution baixa a URL e envia pelo WhatsApp · nao precisa upload-by-id)
  // ────────────────────────────────────────────────────────────────
  if (transport === 'evolution' && hasMedia) {
    const { data: pub } = supabase.storage.from('media').getPublicUrl(mediaPath as string);
    if (!pub?.publicUrl) {
      return NextResponse.json({ error: 'Falha ao gerar URL publica' }, { status: 500 });
    }
    const captionTrim = content?.trim() || undefined;
    const safeFilename = (fileName as string) || (mediaPath as string).split('/').pop() || 'file';
    const baseMimeType = String(mimeType).split(';')[0]?.trim().toLowerCase() ?? '';

    const evo = wa as EvolutionService;
    let sendResult;
    if (mediaType === 'image') {
      sendResult = await evo.sendImage(conv.phone, pub.publicUrl, captionTrim);
    } else if (mediaType === 'audio') {
      // Evolution sendWhatsAppAudio aceita URL · grava como PTT no destinatario.
      // mp3 (lamejs) e ogg/opus funcionam · webm crú nao.
      sendResult = await evo.sendVoice(conv.phone, pub.publicUrl);
    } else if (mediaType === 'document') {
      // sendImage com mediatype=document funciona via /message/sendMedia
      // workaround simples · Evolution aceita generic media via mesma rota
      const evoAny = wa as unknown as { sendImage: (p: string, u: string, c?: string) => Promise<{ ok: boolean; error?: string; messageId?: string | null }> };
      sendResult = await evoAny.sendImage(conv.phone, pub.publicUrl, captionTrim);
    } else {
      return NextResponse.json({ error: `mediaType '${mediaType}' nao suportado em Evolution V1` }, { status: 415 });
    }

    const msgId = uuidv4();
    await repos.messages.saveOutbound(conv.clinicId, {
      id: msgId,
      conversationId: id,
      sender: 'humano',
      content: captionTrim ?? '',
      contentType: mediaType as 'image' | 'audio' | 'document' | 'video',
      mediaUrl: pub.publicUrl,
      status: sendResult.ok ? 'sent' : 'failed',
    });
    if (sendResult.ok) {
      const lastText = captionTrim || `[${mediaType}]`;
      await repos.conversations.updateLastMessage(id, lastText, false);
    }
    void baseMimeType; void safeFilename;
    return NextResponse.json({
      ok: sendResult.ok,
      message_id: msgId,
      whatsappStatus: sendResult.ok ? 'sent' : 'error',
      whatsappError: sendResult.ok ? null : sendResult.error,
      mediaUrl: pub.publicUrl,
      transport,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // P-07 · Branch MIDIA Cloud API · upload pra Meta + send by media_id
  // ────────────────────────────────────────────────────────────────
  const waCloud = wa as WhatsAppCloudService;
  if (hasMedia) {
    // Le blob do Storage com service-role (bucket `media` publico mas usamos
    // SDK pra resolver path corretamente sem expor public URL no fluxo critico)
    const { data: blob, error: dlErr } = await supabase.storage
      .from('media')
      .download(mediaPath as string);
    if (dlErr || !blob) {
      console.error('[API] media download error:', dlErr);
      return NextResponse.json(
        { error: 'Falha ao ler midia do storage' },
        { status: 500 },
      );
    }
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Upload pra Meta · recebe media_id
    const safeFilename = (fileName as string) || (mediaPath as string).split('/').pop() || 'file';
    const upRes = await waCloud.uploadMediaFromBuffer(buffer, mimeType as string, safeFilename);
    if (!upRes.ok) {
      return NextResponse.json(
        { error: `Meta upload falhou: ${upRes.error}` },
        { status: 502 },
      );
    }

    // 2. Send por media_id · branch por tipo
    let sendResult;
    const captionTrim = content?.trim() || undefined;
    const baseMimeType = String(mimeType).split(';')[0]?.trim().toLowerCase() ?? '';
    if (mediaType === 'image') {
      sendResult = await waCloud.sendImageById(conv.phone, upRes.mediaId, captionTrim);
    } else if (mediaType === 'audio') {
      // P-07 · Meta Cloud API nao aceita audio/webm pra voice notes · so
      // ogg/opus, mp3, mp4, aac, amr. Browser Chrome grava em webm.
      // Fallback: enviar como document pro Meta (paciente recebe como anexo
      // de audio · clica e ouve). UI nossa salva como 'audio' no DB pra
      // renderizar com AudioPlayer no chat.
      // TODO: transcodificar webm → ogg/opus server-side via ffmpeg.
      if (baseMimeType === 'audio/webm') {
        sendResult = await waCloud.sendDocumentById(
          conv.phone,
          upRes.mediaId,
          safeFilename,
          captionTrim,
        );
      } else {
        sendResult = await waCloud.sendAudioById(conv.phone, upRes.mediaId);
      }
    } else if (mediaType === 'document') {
      sendResult = await waCloud.sendDocumentById(conv.phone, upRes.mediaId, safeFilename, captionTrim);
    } else if (mediaType === 'video') {
      // sem helper dedicado · usa _sendByMediaId via fallback pra documento (Meta aceita type=video tb)
      // mas pra UX correta, comentar como nao suportado por enquanto
      return NextResponse.json(
        { error: 'video ainda nao suportado · use audio/imagem/PDF' },
        { status: 415 },
      );
    } else {
      return NextResponse.json(
        { error: `mediaType invalido: ${mediaType}` },
        { status: 400 },
      );
    }

    // 3. Salva em wa_messages · publica URL pra render no chat propria UI
    const { data: pub } = supabase.storage.from('media').getPublicUrl(mediaPath as string);
    const msgId = uuidv4();
    await repos.messages.saveOutbound(conv.clinicId, {
      id: msgId,
      conversationId: id,
      sender: 'humano',
      content: captionTrim ?? '', // caption ou vazio
      contentType: mediaType as 'image' | 'audio' | 'document' | 'video',
      mediaUrl: pub.publicUrl,
      status: sendResult.ok ? 'sent' : 'failed',
    });

    // Auto-pause IA + atualiza last_message
    if (sendResult.ok) {
      await repos.conversations.updateAiPause(id, {
        pausedUntil: new Date(Date.now() + 30 * 60000).toISOString(),
        aiEnabled: false,
      });
      const lastText = captionTrim || `[${mediaType}]`;
      await repos.conversations.updateLastMessage(id, lastText, false);
    }

    return NextResponse.json({
      ok: sendResult.ok,
      message_id: msgId,
      whatsappStatus: sendResult.ok ? 'sent' : 'error',
      whatsappError: sendResult.ok ? null : sendResult.error,
      mediaUrl: pub.publicUrl,
      autoPauseActivated: sendResult.ok,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Branch TEXTO (legacy)
  // ────────────────────────────────────────────────────────────────
  const msgId = uuidv4();
  await repos.messages.saveOutbound(conv.clinicId, {
    id: msgId,
    conversationId: id,
    sender: 'humano',
    content: content.trim(),
    contentType: 'text',
    status: 'pending',
  });

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
