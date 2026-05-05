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
import { extractPushNameFromEvolution } from '@/lib/webhook/extract-push-name';
import { isInternalWaNumber } from '@/lib/webhook/internal-phone';
import { transcribeAudio } from '@/services/transcription.service';
import { mediaPaths } from '@clinicai/supabase';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

interface EvolutionPayload {
  event?: string;
  instance?: string;
  pushName?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string; senderPn?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
      audioMessage?: unknown;
      pushName?: string;
    };
    messageType?: string;
    pushName?: string;
    notifyName?: string;
    verifiedBizName?: string;
    contact?: { pushName?: string; notify?: string };
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
  // Diag (2026-05-04 ·): captura raw body ANTES de qualquer validação pra
  // forensics quando Easypanel logs não bastam (incidente Michele 11:01 UTC).
  const rawBody = await request.text();
  const providedSecret = request.headers.get('x-inbound-secret') || '';
  const fromHeaderTrace = request.headers.get('x-forwarded-for');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsedBodyTrace: any = null;
  try { parsedBodyTrace = JSON.parse(rawBody); } catch { /* fallthrough */ }
  const traceInstance: string | null = parsedBodyTrace?.instance ?? null;
  const traceFromPhone: string | null =
    parsedBodyTrace?.data?.key?.senderPn ??
    parsedBodyTrace?.data?.senderPn ??
    parsedBodyTrace?.data?.key?.remoteJid ??
    null;
  const traceMessageText: string | null =
    parsedBodyTrace?.data?.message?.conversation ??
    parsedBodyTrace?.data?.message?.extendedTextMessage?.text ??
    null;
  const traceMessageType: string | null = parsedBodyTrace?.data?.messageType ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evoTraceLog = async (extra: { stage: string; result_status?: number; result_summary?: string; signature_ok?: boolean }) => {
    try {
      const supabase = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('wa_webhook_log').insert({
        endpoint: '/api/webhook/whatsapp-evolution',
        method: 'POST',
        signature_ok: extra.signature_ok ?? null,
        signature_reason: 'evo:' + extra.stage,
        phone_number_id: traceInstance,
        from_phone: traceFromPhone,
        message_text: traceMessageText?.slice(0, 500) ?? null,
        message_type: traceMessageType,
        raw_body: rawBody.slice(0, 8000),
        headers_subset: { 'x-forwarded-for': fromHeaderTrace, 'x-inbound-secret-len': providedSecret.length },
        result_status: extra.result_status ?? null,
        result_summary: 'evo_stage:' + extra.stage,
      });
    } catch {
      // silent · não pode quebrar webhook por falha de logging
    }
  };

  // Auth · shared secret (Evolution nao carrega JWT Supabase).
  // Aceita WA_INBOUND_SECRET (canonical) OU LARA_WA_INBOUND_SECRET (fallback
  // pra cobrir bugs de naming em painel de deploy).
  const expected =
    process.env.WA_INBOUND_SECRET ||
    process.env.LARA_WA_INBOUND_SECRET ||
    '';
  if (!expected) {
    await evoTraceLog({ stage: 'misconfig_no_secret', signature_ok: false, result_status: 500 });
    log.error(
      {
        has_wa_inbound: !!process.env.WA_INBOUND_SECRET,
        has_lara_wa_inbound: !!process.env.LARA_WA_INBOUND_SECRET,
      },
      'webhook_evolution.misconfig · WA_INBOUND_SECRET ausente em runtime',
    );
    return NextResponse.json({ ok: false, error: 'server_misconfigured' }, { status: 500 });
  }
  if (!timingSafeEqual(providedSecret, expected)) {
    await evoTraceLog({ stage: 'unauthorized', signature_ok: false, result_status: 401 });
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  await evoTraceLog({ stage: 'auth_ok', signature_ok: true, result_status: 200 });

  let body: EvolutionPayload;
  try {
    body = JSON.parse(rawBody) as EvolutionPayload;
  } catch {
    await evoTraceLog({ stage: 'invalid_json', signature_ok: true, result_status: 400 });
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const event = body?.event || '';
  if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
    await evoTraceLog({ stage: 'skip_not_message_event', signature_ok: true, result_status: 200, result_summary: 'event=' + event });
    return NextResponse.json({ ok: true, skip: 'not_message_event' });
  }

  const instance = body?.instance || '';
  if (!instance) {
    await evoTraceLog({ stage: 'skip_no_instance', signature_ok: true, result_status: 200 });
    return NextResponse.json({ ok: true, skip: 'no_instance' });
  }
  await evoTraceLog({ stage: 'event_messages_upsert', signature_ok: true, result_status: 200 });

  const data = body?.data ?? {};
  const key = data?.key ?? {};
  // fromMe=true: outbound. Pode ser:
  //   (a) Bot enviou via nossa API · ja tem registro em wa_messages · Evolution
  //       eco · webhook ignora pra evitar duplicata. Detectamos via wa_message_id
  //       ou content match nos últimos segundos.
  //   (b) Humano da clinica digitou DIRETO no celular fisico (Marct/Luciana
  //       confirmando horario) · NAO ESTA NO DB · webhook tem que registrar
  //       senao /secretaria perde historico de saida.
  // Decisao: deixa passar com flag isOutboundFromDevice · branch dedicada
  // mais abaixo pra salvar como outbound + sender='humano' sem disparar
  // auto-greeting nem inbox notification.
  const isOutboundFromDevice = !!key?.fromMe;

  const remoteJid: string = key?.remoteJid || '';
  if (!remoteJid || remoteJid.includes('@g.us')) {
    await evoTraceLog({ stage: 'skip_group_or_invalid', signature_ok: true, result_status: 200, result_summary: 'remoteJid=' + remoteJid.slice(0,40) });
    return NextResponse.json({ ok: true, skip: 'group_or_invalid' });
  }

  // WhatsApp privacy mode (LID) · phone real vai em key.senderPn / data.senderPn
  // pra INBOUND. Pra OUTBOUND fromMe=true a Evolution NAO entrega senderPn ·
  // só remoteJid (LID puro do destinatario, opaco). Solucao: lookup conv via
  // remote_jid ja armazenado de inbound anterior. Salvamos remote_jid no conv
  // a cada inbound LID pra construir mapping LID↔phone over time.
  let phone: string = '';
  let isLidOutboundUnresolved = false;
  if (isOutboundFromDevice) {
    if (remoteJid.endsWith('@lid')) {
      // outbound LID · marca pra lookup posterior por remote_jid
      isLidOutboundUnresolved = true;
    } else {
      phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    }
  } else if (remoteJid.endsWith('@lid')) {
    const senderPn = key?.senderPn || data?.senderPn || '';
    phone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (!phone) {
      log.warn({ remoteJid }, 'webhook_evolution.lid_without_senderPn');
      return NextResponse.json({ ok: true, skip: 'lid_without_senderPn' });
    }
  } else {
    phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
  }

  if (!isLidOutboundUnresolved && !/^\d{10,15}$/.test(phone)) {
    await evoTraceLog({ stage: 'skip_bad_phone', signature_ok: true, result_status: 200, result_summary: 'phone_len=' + phone.length });
    return NextResponse.json({ ok: true, skip: 'bad_phone', phone });
  }
  await evoTraceLog({ stage: 'phone_resolved', signature_ok: true, result_status: 200, result_summary: 'last8=' + (phone.slice(-8) || 'lid') });

  // Resolve wa_number pela instance (RPC mig 92)
  const supabase = createServerClient();

  // Guard bot-to-bot movido pra DEPOIS de tenant_resolved (precisa clinic_id
  // pra escopar wa_numbers · ver isInternalWaNumber). APENAS pra INBOUND ·
  // outbound do tel físico pode legitimamente mandar pra qualquer número
  // (inclusive nossos wa_numbers).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: resolveRes, error: resolveErr } = await (supabase as any).rpc(
    'wa_numbers_resolve_by_instance',
    { p_instance: instance },
  );
  if (resolveErr || !resolveRes?.ok) {
    await evoTraceLog({ stage: 'skip_instance_unresolved', signature_ok: true, result_status: 200, result_summary: 'instance=' + instance });
    log.warn(
      { instance, err: resolveErr?.message ?? resolveRes?.error },
      'webhook_evolution.instance_unresolved',
    );
    return NextResponse.json({ ok: true, skip: 'instance_unresolved', instance });
  }

  const inboxRole = String(resolveRes.inbox_role || 'sdr');
  const clinic_id = String(resolveRes.clinic_id);
  const wa_number_id = String(resolveRes.wa_number_id);
  await evoTraceLog({ stage: 'tenant_resolved', signature_ok: true, result_status: 200, result_summary: 'clinic=' + clinic_id.slice(0,8) + ' role=' + inboxRole });

  // Guard universal · phone vindo de inbound NÃO pode ser um dos NOSSOS
  // wa_numbers (ativo OU inativo · Mira/Marci/Alden mesmo desativados ainda
  // são números operacionais). Audit 2026-05-05 substituiu guard antigo
  // que filtrava is_active=true · deixava inativos escaparem.
  // Outbound device passa direto · clínica pode legitimamente mandar pra
  // próprio número (paciente cadastrado também é nosso wa_number, etc).
  if (phone && !isOutboundFromDevice) {
    const internalCheck = await isInternalWaNumber(supabase, clinic_id, phone);
    if (internalCheck.internal) {
      await evoTraceLog({ stage: 'skip_internal_wa_number', signature_ok: true, result_status: 200, result_summary: 'target=' + (internalCheck.label ?? '') });
      log.info(
        {
          phone_hash: hashPhone(phone),
          own_label: internalCheck.label,
          own_role: internalCheck.inboxRole,
          own_type: internalCheck.numberType,
          own_active: internalCheck.isActive,
        },
        'webhook_evolution.skip_internal_wa_number',
      );
      return NextResponse.json({ ok: true, skip: 'internal_wa_number', target: internalCheck.label });
    }
  }

  // Filter · so processa secretaria · evita interferir em legacy flows da Mih
  if (inboxRole !== 'secretaria') {
    await evoTraceLog({ stage: 'skip_not_secretaria_inbox', signature_ok: true, result_status: 200, result_summary: 'inbox=' + inboxRole });
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

  // Audit 2026-05-05: extração robusta · LID/notifyName/verifiedBizName.
  // Antes: `data?.pushName || ''` · LID frequentemente vazio nesse caminho.
  // Helper tenta 7 campos conhecidos · `source` permite catalogar em prod
  // qual campo está sendo usado por instance.
  const pushNameExtract = extractPushNameFromEvolution(body);
  const pushName = pushNameExtract.value;
  if (pushName) {
    log.info(
      {
        instance,
        source_field: pushNameExtract.source,
        pushName_length: pushName.length,
        phone_hash: hashPhone(phone),
      },
      'webhook_evolution.pushName.present',
    );
  } else {
    log.debug(
      { instance, has_pushName: false, phone_hash: hashPhone(phone) },
      'webhook_evolution.pushName.absent',
    );
  }
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
        // LGPD Fase 1 (2026-05-04): path canonical com clinic_id pra RLS por folder.
        // convId=null porque download acontece antes de resolveConversation · cai
        // em pending/ subfolder (cleanup periódico OK).
        const storagePath = mediaPaths.evolutionInbound(clinic_id, null, uuidv4(), ext);
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
          // Salva PATH (não URL) · UI/outbound geram signed URL on-demand.
          mediaUrl = storagePath;
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

  // Lead + conversation com wa_number_id correto (trigger sincroniza inbox_role).
  // Pra outbound device, pushName eh "Você"/"Clinica..." · ignora pra nao
  // sobrescrever nome do lead (paciente · vem do inbound subsequente).
  const safePushName = isOutboundFromDevice ? '' : pushName;

  // ─── Outbound LID sem senderPn · lookup conv por remote_jid armazenado ───
  // Inbound LID anterior salvou remote_jid no conv (via setRemoteJid abaixo).
  // Outbound LID busca por (remote_jid, wa_number_id) · evita criar lead novo
  // com phone fake (LID puro nao eh phone valido).
  let conv: Awaited<ReturnType<typeof resolveConversation>> = null;
  let lead: Awaited<ReturnType<typeof resolveLead>> = null;
  if (isLidOutboundUnresolved) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: convByJid } = await (supabase as any)
      .from('wa_conversations')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('wa_number_id', wa_number_id)
      .eq('remote_jid', remoteJid)
      .maybeSingle();
    if (convByJid) {
      // Reutiliza lead da conv encontrada
      const { data: leadRow } = await (supabase as any)
        .from('leads')
        .select('*')
        .eq('id', convByJid.lead_id)
        .maybeSingle();
      if (leadRow) {
        lead = leadRow;
        conv = {
          id: convByJid.id,
          clinicId: convByJid.clinic_id,
          waNumberId: convByJid.wa_number_id,
          leadId: convByJid.lead_id,
          phone: convByJid.phone,
          status: convByJid.status,
          aiEnabled: convByJid.ai_enabled,
          aiPausedUntil: convByJid.ai_paused_until,
          lastMessageAt: convByJid.last_message_at,
          lastLeadMsg: convByJid.last_lead_msg,
          lastMessageText: convByJid.last_message_text,
          inboxRole: convByJid.inbox_role,
          handoffToSecretariaAt: convByJid.handoff_to_secretaria_at,
          remoteJid: convByJid.remote_jid,
          displayName: convByJid.display_name,
        } as unknown as Awaited<ReturnType<typeof resolveConversation>>;
        phone = convByJid.phone; // recupera phone real pra dedup downstream
      }
    }
    // Fallback: se NAO tem mapping local, query Evolution API histórico
    // dessa LID buscando inbound com senderPn · resolve LID → phone real.
    if ((!conv || !lead) && waRow?.api_url && waRow?.api_key && waRow?.instance_id) {
      try {
        const r = await fetch(
          `${String(waRow.api_url)}/chat/findMessages/${String(waRow.instance_id)}`,
          {
            method: 'POST',
            headers: {
              apikey: String(waRow.api_key),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              where: { key: { remoteJid, fromMe: false } },
              limit: 5,
            }),
          },
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const evoData: any = await r.json().catch(() => null);
        const records = evoData?.messages?.records || (Array.isArray(evoData) ? evoData : []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const senderPn = records.find((m: any) => m?.key?.senderPn)?.key?.senderPn;
        if (senderPn) {
          const resolvedPhone = String(senderPn).replace('@s.whatsapp.net', '').replace(/\D/g, '');
          if (/^\d{10,15}$/.test(resolvedPhone)) {
            log.info(
              { instance, remoteJid, resolvedPhone: hashPhone(resolvedPhone) },
              'webhook_evolution.outbound_lid.resolved_via_evolution_history',
            );
            // Resolve lead + conv com phone real · salva remote_jid pra futuro
            const fallbackLead = await resolveLead({ leads: repos.leads, clinic_id, phone: resolvedPhone, pushName: '', supabase });
            const fallbackConv = fallbackLead ? await resolveConversation({
              conversations: repos.conversations,
              clinic_id,
              phone: resolvedPhone,
              lead: fallbackLead,
              pushName: '',
              supabase,
              waNumberId: wa_number_id,
            }) : null;
            if (fallbackLead && fallbackConv) {
              // Persiste remote_jid pra cache futuro
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any)
                  .from('wa_conversations')
                  .update({ remote_jid: remoteJid })
                  .eq('id', fallbackConv.id);
              } catch { /* silent */ }
              lead = fallbackLead;
              conv = fallbackConv;
              phone = resolvedPhone;
            }
          }
        }
      } catch (err) {
        log.warn(
          { instance, remoteJid, err: (err as Error)?.message },
          'webhook_evolution.outbound_lid.evolution_lookup_failed',
        );
      }
    }

    if (!conv || !lead) {
      log.warn(
        { instance, remoteJid },
        'webhook_evolution.outbound_lid.no_mapping · skip · espera inbound LID prévio salvar mapping',
      );
      return NextResponse.json({ ok: true, skip: 'lid_unmapped', remoteJid });
    }
  } else {
    lead = await resolveLead({ leads: repos.leads, clinic_id, phone, pushName: safePushName, supabase });
    if (!lead) {
      log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'webhook_evolution.lead.create.failed');
      return NextResponse.json({ ok: false, error: 'lead_create_failed' }, { status: 500 });
    }
    conv = await resolveConversation({
      conversations: repos.conversations,
      clinic_id,
      phone,
      lead,
      pushName: safePushName,
      supabase,
      waNumberId: wa_number_id,
    });
    if (!conv || !lead) {
      return NextResponse.json({ ok: false, error: 'conversation_create_failed' }, { status: 500 });
    }
    // Salva remote_jid no inbound LID · constrói mapping pra outbound LID futuro
    if (!isOutboundFromDevice && remoteJid.endsWith('@lid') && conv.remoteJid !== remoteJid) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('wa_conversations')
          .update({ remote_jid: remoteJid })
          .eq('id', conv.id);
      } catch (err) {
        log.warn(
          { conv_id: conv.id, err: (err as Error)?.message },
          'webhook_evolution.remote_jid.save_failed',
        );
      }
    }
  }

  await evoTraceLog({ stage: 'lead_conv_resolved', signature_ok: true, result_status: 200, result_summary: 'conv=' + conv.id.slice(0,8) });

  // Dedup soft · Evolution retry pode entregar 2x na mesma janela curta
  // Audit 2026-05-04: dedup por conteúdo é FALLBACK pra payloads sem key.id.
  // Quando key.id está presente (caminho normal Baileys), idempotência fica
  // 100% no DB via uq_wa_messages_provider_id. Evita descartar mensagens
  // legítimas iguais com provider_msg_id distinto.
  if (!key?.id && await repos.messages.findRecentDuplicate(conv.id, content)) {
    await evoTraceLog({ stage: 'skip_duplicate', signature_ok: true, result_status: 200, result_summary: 'conv=' + conv.id.slice(0,8) });
    return NextResponse.json({ ok: true, skip: 'duplicate' });
  }

  const sentAtStr = new Date().toISOString();

  // ─── Branch OUTBOUND humano · clinica digitou direto no celular fisico ────
  // Salva como outbound + sender='humano' · NAO dispara auto-greeting nem
  // inbox notification (eco do nosso proprio envio nao precisa alertar nada).
  // Dedup adicional por content match nos ultimos 30s evita registrar duas
  // vezes mensagens que SAIRAM via /api/conversations/[id]/messages (eco do
  // proprio bot · Evolution reflete tudo que sai inclusive pelo endpoint).
  if (isOutboundFromDevice) {
    // Fix UX 2026-05-04 · quando Luciana manda imagem/audio sem caption pelo
    // celular, content cai no fallback '[imagem recebida]'/'[audio recebido]'
    // (extract.ts é shared pro inbound · faz sentido pra paciente, NÃO pra
    // outbound). Inverter pra UI mostrar "enviada" no balão da clínica.
    if (content === '[imagem recebida]') content = '[imagem enviada]';
    else if (content === '[audio recebido]') content = '[audio enviado]';
    else if (content === '[video recebido]') content = '[video enviado]';
    else if (content === '[documento recebido]') content = '[documento enviado]';
    else if (content === '[sticker recebido]') content = '[sticker enviado]';
    // Se ja temos o conteudo identico em outbound recente · provavelmente
    // foi enviado via app · skip pra nao duplicar
    const recentOutboundDup = await (async () => {
      try {
        const cutoff = new Date(Date.now() - 30_000).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: dup } = await (supabase as any)
          .from('wa_messages')
          .select('id')
          .eq('conversation_id', conv.id)
          .eq('direction', 'outbound')
          .eq('content', content)
          .gte('sent_at', cutoff)
          .maybeSingle();
        return !!dup;
      } catch { return false; }
    })();
    if (recentOutboundDup) {
      log.info(
        { clinic_id, conv_id: conv.id, contentPreview: content.slice(0, 60) },
        'webhook_evolution.outbound_device.skip_app_echo',
      );
      return NextResponse.json({ ok: true, skip: 'app_echo' });
    }

    // Audit 2026-05-04: key.id = wa_message_id da Evolution. Popula
    // provider_msg_id pra idempotência via UNIQUE uq_wa_messages_provider_id ·
    // protege contra Evolution re-entregar o mesmo eco do device.
    const outId = await repos.messages.saveOutbound(clinic_id, {
      conversationId: conv.id,
      sender: 'humano',
      content,
      contentType,
      mediaUrl,
      sentAt: sentAtStr,
      status: 'sent',
      providerMsgId: key.id ?? null,
      waMessageId: key.id ?? null,
      channel: 'evolution',
    });
    if (outId) {
      await repos.conversations.updateLastMessage(conv.id, content, false, sentAtStr);
      log.info(
        { clinic_id, conv_id: conv.id, contentType },
        'webhook_evolution.outbound_device.saved',
      );
    } else {
      log.warn(
        { clinic_id, conv_id: conv.id },
        'webhook_evolution.outbound_device.save_failed',
      );
    }
    return NextResponse.json({ ok: true, kind: 'outbound_device', conversation_id: conv.id });
  }

  await evoTraceLog({ stage: 'before_saveInbound', signature_ok: true, result_status: 200, result_summary: 'conv=' + conv.id.slice(0,8) });
  // Audit 2026-05-04: provider_msg_id = key.id da Evolution · idempotência
  // real contra retry (UNIQUE uq_wa_messages_provider_id · ver saveInbound).
  const insertedId = await repos.messages.saveInbound(clinic_id, {
    conversationId: conv.id,
    phone,
    content,
    contentType,
    mediaUrl,
    sentAt: sentAtStr,
    providerMsgId: key.id ?? null,
    waMessageId: key.id ?? null,
    channel: 'evolution',
  });
  if (!insertedId) {
    await evoTraceLog({ stage: 'saveInbound_returned_null', signature_ok: true, result_status: 500, result_summary: 'conv=' + conv.id.slice(0,8) });
    log.error(
      { clinic_id, conv_id: conv.id, contentType, contentPreview: content.slice(0, 60) },
      'webhook_evolution.save_inbound_failed · skipping updateLastMessage to avoid orphan preview',
    );
    return NextResponse.json({ ok: false, error: 'save_failed' }, { status: 500 });
  }
  await evoTraceLog({ stage: 'after_saveInbound_ok', signature_ok: true, result_status: 200, result_summary: 'msg_id=' + insertedId.slice(0,8) });

  // Bug 2 fix: Evolution às vezes envia 2 webhooks (audio + text-transcricao)
  // pra mesma mensagem · resultando em UI com "transcricao separada do audio".
  // Quando salvamos audio com transcrição embedded, removemos text duplicado
  // recente (último 90s · audio vence porque tem mediaUrl + transcrição).
  if (contentType === 'audio' && content && !content.startsWith('[audio')) {
    try {
      const removed = await repos.messages.deleteTextDuplicateOfAudio(conv.id, content, 90);
      if (removed > 0) {
        log.info(
          { clinic_id, conv_id: conv.id, removed_text_dups: removed },
          'webhook_evolution.audio.text_duplicates_removed',
        );
      }
    } catch (err) {
      log.warn(
        { clinic_id, conv_id: conv.id, err: (err as Error)?.message },
        'webhook_evolution.audio.dedup_failed',
      );
    }
  }

  await repos.conversations.updateLastMessage(conv.id, content, true, sentAtStr);

  // Auto-greeting · ack imediato.
  // Mig 114 (2026-05-04): claim atomic via RPC · cobre 4 bugs da guard antiga
  // (countInboundSince==1). RPC retorna false se Luciana mandou nas últimas 6h
  // OU já houve greeting nas últimas 24h. Guard waRow continua: sem credentials
  // Evolution não dá pra mandar mesmo · skip antes do claim pra não fazer
  // claim que vai precisar unclaim.
  try {
    if (!waRow?.api_url || !waRow?.api_key || !waRow?.instance_id) {
      log.debug(
        { clinic_id, conv_id: conv.id },
        'webhook_evolution.auto_greeting.skipped · evolution_creds_missing',
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: claimed, error: claimErr } = await (supabase as any).rpc(
        'wa_secretaria_auto_greeting_claim',
        { p_conversation_id: conv.id },
      );
      if (claimErr) {
        log.warn(
          { clinic_id, conv_id: conv.id, err: claimErr.message },
          'webhook_evolution.auto_greeting.claim_error',
        );
      } else if (claimed === true) {
        const firstName = (lead.name || '').split(/\s+/)[0] || '';
        const greet = firstName
          ? `Oi *${firstName}*! 💛 Recebi sua mensagem aqui · ja avisei a Luciana, nossa secretaria · ela vai te atender em alguns minutinhos. ✨`
          : `Oi! 💛 Recebi sua mensagem aqui · ja avisei a Luciana, nossa secretaria · ela vai te atender em alguns minutinhos. ✨`;
        const evo = new EvolutionService({
          apiUrl: String(waRow.api_url),
          apiKey: String(waRow.api_key),
          instance: String(waRow.instance_id),
        });
        const sent = await evo.sendText(phone, greet);
        if (sent.ok) {
          await repos.messages.saveOutbound(clinic_id, {
            conversationId: conv.id,
            sender: 'humano',
            content: greet,
            contentType: 'text',
            status: 'sent',
            providerMsgId: sent.messageId ?? null,
            waMessageId: sent.messageId ?? null,
            channel: 'evolution',
          });
          // PROPOSITAL: NAO atualizar last_message_text/at · conv mantem
          // preview da inbound do paciente · permanece em "Aguardando"
          // (KPI default da Luciana) · auto-greeting eh ack, nao resposta.
          log.info(
            { clinic_id, conv_id: conv.id, phone_hash: hashPhone(phone) },
            'webhook_evolution.auto_greeting.sent',
          );
        } else {
          // Send falhou · unclaim pra próxima inbound re-tentar (vs ficar 24h muda)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc('wa_secretaria_auto_greeting_unclaim', {
            p_conversation_id: conv.id,
          });
          log.warn(
            { clinic_id, conv_id: conv.id, err: sent.error },
            'webhook_evolution.auto_greeting.send_failed_unclaimed',
          );
        }
      } else {
        log.debug(
          { clinic_id, conv_id: conv.id },
          'webhook_evolution.auto_greeting.skipped · luciana_active_or_cooldown',
        );
      }
    }
  } catch (err) {
    log.warn(
      { clinic_id, conv_id: conv.id, err: (err as Error)?.message },
      'webhook_evolution.auto_greeting.exception',
    );
  }

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
