/**
 * GET  /api/conversations/[id]/messages · lista mensagens
 * POST /api/conversations/[id]/messages · envia manual (humano assume)
 *
 * ADR-012: tudo via Repositories. Multi-tenant ADR-028 via JWT.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  loadServerContext,
  signOrPassthrough,
  signMediaPath,
  isVoucherAudioPath,
  VOUCHER_AUDIO_BUCKET,
  SIGNED_URL_TTL_UI,
  SIGNED_URL_TTL_META,
} from '@clinicai/supabase';
import {
  WhatsAppCloudService,
  EvolutionService,
  type SendTextOptions,
  type WhatsAppSendResult,
} from '@clinicai/whatsapp';
import { makeRepos } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { resolveProviderForConv } from '@/lib/whatsapp/resolve-provider';
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

  // Fase 1 LGPD: media_url no DB vira PATH em writes novos · GET assina on-demand.
  // signOrPassthrough trata legado (URL pública) sem mudança · transitional até backfill.
  //
  // Audit 2026-05-06: voucher-audio vive em bucket SEPARADO (`voucher-audio`,
  // não `media`). Edge b2b-voucher-audio salva path `YYYY-MM/<voucher_id>.mp3` ·
  // sem detectar o bucket correto, signMediaPath retornava null e AudioPlayer
  // não renderizava no dash. isVoucherAudioPath identifica pelo formato.
  const mediasResolved = await Promise.all(
    messages.map(async (m) => {
      const isVoucher = isVoucherAudioPath(m.mediaUrl);
      const mediaUrl = isVoucher
        ? await signOrPassthrough(supabase, m.mediaUrl, SIGNED_URL_TTL_UI, VOUCHER_AUDIO_BUCKET)
        : await signOrPassthrough(supabase, m.mediaUrl, SIGNED_URL_TTL_UI);
      return { ...m, mediaUrl };
    }),
  );

  // Mantem shape legado (snake_case) pro frontend que ainda nao migrou
  return NextResponse.json(
    mediasResolved.map((m) => ({
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
      // Audit 2026-05-06 · template_id pro dash detectar B2B/voucher (label)
      template_id: m.templateId ?? null,
      // Mig 143 (2026-05-07) · quoted reply · UI usa provider_msg_id pra
      // localizar mensagem original respondida e renderizar bubble com quote.
      provider_msg_id: m.providerMsgId ?? null,
      reply_to_provider_msg_id: m.replyToProviderMsgId ?? null,
      // Mig 144 (2026-05-07) · payload normalizado de mensagem rica
      // (contact, location, reaction, sticker, forward, poll). Null pra
      // texto/mídia simples · UI faz type-guard `payload?.kind === 'contact'`.
      payload: m.payload ?? null,
      // React A (2026-05-07) · emoji corrente · UI renderiza chip abaixo
      // do balão · null = sem reação.
      reaction: m.reaction ?? null,
    })),
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  // Forward D1 (2026-05-07) · vars do body são `let` porque `forward_from_message_id`
  // pode override (server resolve original e injeta content/mediaPath/etc).
  const { internal } = body;
  let content: string | undefined = body?.content;
  let mediaPath: string | undefined = body?.mediaPath;
  let mediaType: string | undefined = body?.mediaType;
  let mimeType: string | undefined = body?.mimeType;
  let fileName: string | undefined = body?.fileName;
  // Mig 143 (2026-05-07) · quoted reply opcional · uuid interno de wa_messages.
  // Validação completa acontece depois do conv lookup (precisa conv.id pra
  // checar se target pertence à mesma conversa).
  const replyToMessageId: string | null =
    typeof body?.reply_to_message_id === 'string' && body.reply_to_message_id.trim()
      ? body.reply_to_message_id.trim()
      : null;
  // Forward D1 (2026-05-07) · uuid interno de wa_messages a ser encaminhado.
  // Server resolve original via getById, valida clinic_id + type + media,
  // e popula content/mediaPath/mediaType/mimeType/fileName · client NUNCA
  // envia path bruto · prevenção de cross-tenant + path traversal.
  const forwardFromMessageId: string | null =
    typeof body?.forward_from_message_id === 'string' && body.forward_from_message_id.trim()
      ? body.forward_from_message_id.trim()
      : null;

  // Forward B (2026-05-07) · payload opcional pra mensagens ricas encaminhadas.
  // Whitelist estrita · só `kind:'contact'` aceito hoje · qualquer outro shape
  // → 422 invalid_payload_kind. Normaliza pra extrair APENAS campos da
  // whitelist · NUNCA persiste vCard cru, email, endereço, org, ou arrays
  // arbitrários (LGPD · disciplina mig 144).
  let normalizedOutboundPayload: Record<string, unknown> | null = null;
  if (body?.payload !== undefined && body.payload !== null) {
    const raw = body.payload;
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'invalid_payload_shape' }, { status: 422 });
    }
    const p = raw as Record<string, unknown>;
    if (p.kind !== 'contact') {
      return NextResponse.json({ error: 'invalid_payload_kind' }, { status: 422 });
    }
    const norm: Record<string, unknown> = { kind: 'contact' };
    if (typeof p.name === 'string') norm.name = p.name;
    if (typeof p.phone === 'string') norm.phone = p.phone;
    if (typeof p.display_phone === 'string') norm.display_phone = p.display_phone;
    if (typeof p.wa_id === 'string') norm.wa_id = p.wa_id;
    if (p.source === 'cloud' || p.source === 'evolution') norm.source = p.source;
    // forwarded_from: rastreabilidade da origem · 3 campos opcionais string.
    if (p.forwarded_from && typeof p.forwarded_from === 'object') {
      const ff = p.forwarded_from as Record<string, unknown>;
      const ffNorm: Record<string, unknown> = {};
      if (typeof ff.message_id === 'string') ffNorm.message_id = ff.message_id;
      if (typeof ff.provider_msg_id === 'string') ffNorm.provider_msg_id = ff.provider_msg_id;
      if (typeof ff.conversation_id === 'string') ffNorm.conversation_id = ff.conversation_id;
      if (Object.keys(ffNorm).length > 0) norm.forwarded_from = ffNorm;
    }
    normalizedOutboundPayload = norm;
  }

  // P-07 · gate de content/media movido pra DEPOIS da forward resolution
  // (Forward D1 · 2026-05-07) · `forward_from_message_id` injeta vars
  // server-side, então o gate precisa rodar com o estado pós-resolution.

  // Auth · valida JWT/clinic_id ANTES de service_role pra escrita.
  // wa_messages/wa_conversations sao RLS-hardened (authenticated nao tem
  // INSERT/UPDATE) · service_role bypassa RLS · escopo multi-tenant
  // garantido manualmente comparando conv.clinicId vs ctx.clinic_id abaixo.
  const { ctx } = await loadServerContext();
  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  const conv = await repos.conversations.getById(id);
  if (conv && conv.clinicId !== ctx.clinic_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Forward D1/E1 (2026-05-07) · resolve original e injeta vars de mídia.
  // Server lê wa_messages.media_url (Storage path canônico) · valida clinic_id
  // (cross-tenant guard) · valida type ∈ {'image','audio'} · resolve MIME via
  // extensão do path com fallback seguro por tipo. Branches Cloud/Evolution
  // rodam depois com mediaPath/mediaType/mimeType/fileName populados como se
  // tivessem vindo do body. Payload `media_forward` rastreia origem.
  let forwardPayload: Record<string, unknown> | null = null;
  if (forwardFromMessageId) {
    const original = await repos.messages.getById(forwardFromMessageId);
    if (!original) {
      return NextResponse.json({ error: 'invalid_forward_source' }, { status: 422 });
    }
    if (original.clinicId !== ctx.clinic_id) {
      return NextResponse.json({ error: 'forward_source_wrong_clinic' }, { status: 422 });
    }
    // Whitelist · MVP D1=image · MVP E1=audio · video/sticker/document ficam fora.
    const supportedForwardTypes = ['image', 'audio'] as const;
    type SupportedForwardType = (typeof supportedForwardTypes)[number];
    if (!supportedForwardTypes.includes(original.contentType as SupportedForwardType)) {
      return NextResponse.json({ error: 'unsupported_forward_type' }, { status: 422 });
    }
    if (!original.mediaUrl) {
      return NextResponse.json({ error: 'forward_source_missing_media' }, { status: 422 });
    }
    const forwardMediaType = original.contentType as SupportedForwardType;
    // Resolve MIME via extensão do path · branch por tipo · fallback seguro.
    const lowerPath = original.mediaUrl.toLowerCase();
    const ext = lowerPath.split('.').pop() ?? '';
    let mimeFromExt: string;
    let defaultFilename: string;
    if (forwardMediaType === 'audio') {
      // .ogg → audio/ogg (90% inbound) · .mp3 → audio/mpeg · .mp4/.m4a →
      // audio/mp4 · fallback audio/ogg (formato canônico WhatsApp PTT).
      mimeFromExt =
        ext === 'mp3' ? 'audio/mpeg'
        : ext === 'mp4' || ext === 'm4a' ? 'audio/mp4'
        : ext === 'ogg' || ext === 'opus' ? 'audio/ogg'
        : 'audio/ogg';
      defaultFilename = `audio.${ext || 'ogg'}`;
    } else {
      // image · mantém comportamento D1.
      mimeFromExt =
        ext === 'png' ? 'image/png'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : 'image/jpeg';
      defaultFilename = `image.${ext || 'jpg'}`;
    }
    // Override vars do body · client NUNCA envia mediaPath/mimeType/fileName
    // pra forward · server é única fonte de verdade aqui.
    // Audio sem transcrição · placeholder seguro pra updateLastMessage e
    // copy/preview futuros (NUNCA expõe path/URL no content).
    const fallbackContent =
      forwardMediaType === 'audio' ? '[áudio encaminhado]' : '';
    content = original.content || fallbackContent;
    mediaPath = original.mediaUrl;
    mediaType = forwardMediaType;
    mimeType = mimeFromExt;
    fileName = original.mediaUrl.split('/').pop() || defaultFilename;
    // Payload media_forward · rastreia origem · saveOutbound persiste em
    // wa_messages.payload jsonb (mig 144). NUNCA copia payload bruto da
    // mensagem original · só id/conversation_id/provider_msg_id (whitelist).
    const ff: Record<string, string> = { message_id: original.id };
    if (original.providerMsgId) ff.provider_msg_id = original.providerMsgId;
    if (original.conversationId) ff.conversation_id = original.conversationId;
    forwardPayload = {
      kind: 'media_forward',
      media_type: forwardMediaType,
      forwarded_from: ff,
    };
  }

  // P-07 · pelo menos content OU midia · agora reflete forward override.
  const hasMedia = !!mediaPath && !!mediaType && !!mimeType;
  if (!content?.trim() && !hasMedia) {
    return NextResponse.json({ error: 'Content ou media obrigatorio' }, { status: 400 });
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
    // Fase 1 LGPD: signed URL TTL 24h pra Evolution baixar (margem ampla).
    const signedForEvo = await signMediaPath(supabase, mediaPath as string, SIGNED_URL_TTL_META);
    if (!signedForEvo) {
      return NextResponse.json({ error: 'Falha ao gerar signed URL pra Evolution' }, { status: 500 });
    }
    const captionTrim = content?.trim() || undefined;
    const safeFilename = (fileName as string) || (mediaPath as string).split('/').pop() || 'file';
    const baseMimeType = String(mimeType).split(';')[0]?.trim().toLowerCase() ?? '';

    const evo = wa as EvolutionService;
    let sendResult;
    if (mediaType === 'image') {
      sendResult = await evo.sendImage(conv.phone, signedForEvo, captionTrim);
    } else if (mediaType === 'audio') {
      // Evolution sendWhatsAppAudio aceita URL · grava como PTT no destinatario.
      // mp3 (lamejs) e ogg/opus funcionam · webm crú nao.
      sendResult = await evo.sendVoice(conv.phone, signedForEvo);
    } else if (mediaType === 'document') {
      // sendImage com mediatype=document funciona via /message/sendMedia
      // workaround simples · Evolution aceita generic media via mesma rota
      const evoAny = wa as unknown as { sendImage: (p: string, u: string, c?: string) => Promise<{ ok: boolean; error?: string; messageId?: string | null }> };
      sendResult = await evoAny.sendImage(conv.phone, signedForEvo, captionTrim);
    } else {
      return NextResponse.json({ error: `mediaType '${mediaType}' nao suportado em Evolution V1` }, { status: 415 });
    }

    const msgId = uuidv4();
    // Salva PATH (não URL) · próxima leitura via GET re-assina TTL 1h.
    await repos.messages.saveOutbound(conv.clinicId, {
      id: msgId,
      conversationId: id,
      sender: 'humano',
      content: captionTrim ?? '',
      contentType: mediaType as 'image' | 'audio' | 'document' | 'video',
      mediaUrl: mediaPath as string,
      status: sendResult.ok ? 'sent' : 'failed',
      providerMsgId: sendResult.messageId ?? null,
      waMessageId: sendResult.messageId ?? null,
      channel: 'evolution',
      // Forward D1 · payload media_forward quando vem de forward_from_message_id.
      // Outbound manual via UI (paperclip) não popula · null preserva legacy.
      payload: forwardPayload,
    });
    if (sendResult.ok) {
      const lastText = captionTrim || `[${mediaType}]`;
      await repos.conversations.updateLastMessage(id, lastText, false);
    }
    void baseMimeType; void safeFilename;
    // Devolve signed URL pro client renderizar imediatamente (TTL 1h, suficiente).
    const previewForClient = await signMediaPath(supabase, mediaPath as string, SIGNED_URL_TTL_UI);
    return NextResponse.json({
      ok: sendResult.ok,
      message_id: msgId,
      whatsappStatus: sendResult.ok ? 'sent' : 'error',
      whatsappError: sendResult.ok ? null : sendResult.error,
      mediaUrl: previewForClient,
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

    // 3. Salva em wa_messages · PATH (não URL) · GET re-assina TTL 1h.
    const msgId = uuidv4();
    await repos.messages.saveOutbound(conv.clinicId, {
      id: msgId,
      conversationId: id,
      sender: 'humano',
      content: captionTrim ?? '', // caption ou vazio
      contentType: mediaType as 'image' | 'audio' | 'document' | 'video',
      mediaUrl: mediaPath as string,
      status: sendResult.ok ? 'sent' : 'failed',
      providerMsgId: sendResult.messageId ?? null,
      waMessageId: sendResult.messageId ?? null,
      channel: 'cloud',
      // Forward D1 · payload media_forward quando vem de forward_from_message_id.
      payload: forwardPayload,
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

    // Signed URL pro client renderizar imediato (TTL 1h, suficiente).
    const previewForClient = await signMediaPath(supabase, mediaPath as string, SIGNED_URL_TTL_UI);
    return NextResponse.json({
      ok: sendResult.ok,
      message_id: msgId,
      whatsappStatus: sendResult.ok ? 'sent' : 'error',
      whatsappError: sendResult.ok ? null : sendResult.error,
      mediaUrl: previewForClient,
      autoPauseActivated: sendResult.ok,
    });
  }

  // ────────────────────────────────────────────────────────────────
  // Branch TEXTO · suporta Cloud OU Evolution conforme transport resolvido.
  // Audit 2026-05-05: branch antes era marcado hardcoded como 'cloud' no
  // updateStatus · convs em wa_numbers Evolution gravavam channel errado e
  // analytics agrupavam mal. Agora propaga transport real.
  // ────────────────────────────────────────────────────────────────
  // env_fallback é o legado (sem wa_numbers row) · Cloud env-global · marca
  // como 'cloud' no DB pra UI/analytics tratarem como Cloud.
  const channelLabel: 'cloud' | 'evolution' =
    transport === 'evolution' ? 'evolution' : 'cloud';

  // Forward D1 (2026-05-07) · narrowing · neste ponto chegamos no branch texto,
  // logo `!hasMedia` (caso contrário um dos branches de mídia já teria
  // returnado). O gate "content OU media" garantiu content non-empty quando
  // hasMedia=false. TypeScript não consegue narrowar a condicional composta ·
  // assertion explícita aqui evita 6 non-null assertions abaixo.
  const textContent: string = content as string;

  // Mig 143 (2026-05-07) · quoted reply pipeline.
  // Resolve target via getById, valida 3 invariantes (existe · mesma conv ·
  // tem provider_msg_id) e monta SendTextOptions conforme transport. Falha
  // hard com 422 quando target inválido · sem fallback silencioso (regra
  // explícita do escopo · UI mostra erro pra usuário decidir).
  let sendTextOptions: SendTextOptions | undefined;
  let replyToProviderMsgId: string | null = null;
  if (replyToMessageId) {
    const target = await repos.messages.getById(replyToMessageId);
    if (!target) {
      return NextResponse.json({ error: 'invalid_reply_target' }, { status: 422 });
    }
    if (target.conversationId !== id) {
      return NextResponse.json(
        { error: 'invalid_reply_target_conversation' },
        { status: 422 },
      );
    }
    if (!target.providerMsgId) {
      return NextResponse.json(
        { error: 'reply_target_no_provider_id' },
        { status: 422 },
      );
    }
    replyToProviderMsgId = target.providerMsgId;

    if (transport === 'evolution') {
      // remoteJid: prefere conv.remoteJid (populado pelo webhook em LID e
      // gravado em outbound device · ver whatsapp-evolution/route.ts).
      // Fallback `${phone}@s.whatsapp.net` cobre convs inbound padrão BR
      // que não tiveram LID · Evolution aceita esse format pra Baileys.
      const remoteJid =
        conv.remoteJid && conv.remoteJid.length > 0
          ? conv.remoteJid
          : `${conv.phone}@s.whatsapp.net`;
      sendTextOptions = {
        quotedBaileys: {
          remoteJid,
          fromMe: target.direction === 'outbound',
          id: target.providerMsgId,
          text: target.content?.slice(0, 200) ?? '',
        },
      };
    } else {
      // Cloud + env_fallback usam mesma API Meta · context.message_id (wamid)
      sendTextOptions = {
        quotedProviderMsgId: target.providerMsgId,
      };
    }
  }

  // Forward B · content_type='contact' quando payload é contato (consistente
  // com inbound · UI dash filtra/renderiza ContactCard via payload.kind).
  // Texto puro segue 'text'.
  const outboundContentType: 'text' | 'contact' =
    normalizedOutboundPayload?.kind === 'contact' ? 'contact' : 'text';

  const msgId = uuidv4();
  const savedId = await repos.messages.saveOutbound(conv.clinicId, {
    id: msgId,
    conversationId: id,
    sender: 'humano',
    content: textContent.trim(),
    contentType: outboundContentType,
    status: 'pending',
    channel: channelLabel,
    // Mig 143 · vínculo persistido aqui · independe do sucesso do send
    // (UI ainda assim renderiza quote do alvo · DB tem rastro).
    replyToProviderMsgId,
    // Forward B · payload normalizado (whitelist contact-only) · NUNCA payload
    // bruto · saveOutbound persiste em wa_messages.payload jsonb (mig 144).
    payload: normalizedOutboundPayload,
  });
  if (!savedId) {
    console.error('[messages POST] saveOutbound retornou null', {
      conv_id: id,
      content_preview: textContent.trim().slice(0, 80),
    });
    return NextResponse.json(
      { error: 'Falha ao salvar mensagem · saveOutbound retornou null' },
      { status: 500 },
    );
  }

  // Forward C (2026-05-07) · envio nativo de contato quando payload.kind='contact'.
  // Provider Cloud/Evolution implementam sendContact · destinatário recebe
  // contato real navegável (não texto formatado). Fallback automático pra
  // sendText se o método não existir OU o send falhar (ex: Evolution sem o
  // endpoint /message/sendContact configurado). Quoted reply NÃO suportado em
  // contato nativo · Cloud/Meta API não aceita context.message_id em
  // type='contacts' · cai no fallback texto se houver replyTo.
  let result: WhatsAppSendResult;
  let usedNativeContact = false;
  const wantNativeContact =
    !!normalizedOutboundPayload &&
    normalizedOutboundPayload.kind === 'contact' &&
    !replyToProviderMsgId;
  if (wantNativeContact && typeof wa.sendContact === 'function') {
    const p = normalizedOutboundPayload as Record<string, unknown>;
    const contactName = typeof p.name === 'string' ? p.name : 'Contato';
    const contactPhone =
      (typeof p.phone === 'string' && p.phone) ||
      (typeof p.wa_id === 'string' && p.wa_id) ||
      '';
    if (contactPhone) {
      const nativeRes = await wa.sendContact(conv.phone, {
        name: contactName,
        phone: contactPhone,
        displayPhone: typeof p.display_phone === 'string' ? p.display_phone : null,
        waId: typeof p.wa_id === 'string' ? p.wa_id : null,
      });
      if (nativeRes.ok) {
        result = nativeRes;
        usedNativeContact = true;
      } else {
        // Log estruturado · sem secret · fallback transparente.
        console.warn('[messages POST] sendContact failed · falling back to sendText', {
          channel: channelLabel,
          error_preview: typeof nativeRes.error === 'string' ? nativeRes.error.slice(0, 200) : null,
        });
        result = await wa.sendText(conv.phone, textContent.trim(), sendTextOptions);
      }
    } else {
      result = await wa.sendText(conv.phone, textContent.trim(), sendTextOptions);
    }
  } else {
    result = await wa.sendText(conv.phone, textContent.trim(), sendTextOptions);
  }
  void usedNativeContact;

  // Audit 2026-05-04/05: provider_msg_id só fica disponível após o send ·
  // UPDATE retroativo via updateStatus (saveOutbound roda antes pra preservar
  // rastro se send falhar). channel propaga transport real (cloud|evolution).
  await repos.messages.updateStatus(savedId, result.ok ? 'sent' : 'failed', {
    providerMsgId: result.messageId ?? null,
    waMessageId: result.messageId ?? null,
    channel: channelLabel,
  });

  // Auto-pause IA quando humano envia · 30 min default
  await repos.conversations.updateAiPause(id, {
    pausedUntil: new Date(Date.now() + 30 * 60000).toISOString(),
    aiEnabled: false,
  });
  // updateLastMessage agora rola dentro do saveOutbound automaticamente
  // pra sender='humano' (mig 2026-05-03 fix). Mantem chamada explicita
  // como redundancia segura · UPDATE condicional no saveOutbound nao
  // sobrescreve se already mais novo.
  await repos.conversations.updateLastMessage(id, textContent.trim(), false);

  return NextResponse.json({
    ok: true,
    message_id: msgId,
    whatsappStatus: result.ok ? 'sent' : 'error',
    whatsappError: result.ok ? null : result.error,
    autoPauseActivated: true,
  });
}
