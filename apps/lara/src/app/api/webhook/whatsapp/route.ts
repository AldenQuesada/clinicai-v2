/**
 * WhatsApp Cloud API Webhook
 *
 * GET  → Verification handshake with Meta
 * POST → Receive inbound messages, process with AI, reply
 *
 * This replaces the entire n8n lara-whatsapp-workflow.json
 *
 * ⚠️ MULTI-TENANT REFACTOR PENDENTE (ADR-028 · Fase 1.5)
 * ----------------------------------------------------------------
 * Importado do clinicai-lara do Ivan AS-IS · 4 pontos com clinic_id
 * hardcoded ('00000000-0000-0000-0000-000000000001'):
 *   - linha ~96  (lead INSERT)
 *   - linha ~129 (wa_conversations INSERT)
 *   - linha ~282 (wa_messages outbound)
 *   - linha ~521 (idem)
 *
 * Refactor planejado · Fase 1.5 (commit separado após validar build):
 *   1. Extrair phone_number_id de body.entry[0].changes[0].value.metadata.phone_number_id
 *   2. Resolver clinic_id via @clinicai/supabase/tenant resolveClinicByPhoneNumberId()
 *   3. Substituir os 4 literais por const clinic_id resolvido
 *   4. WhatsApp send: usar createWhatsAppCloudFromWaNumber() em vez de
 *      WhatsAppCloudService() com env vars globais
 *   5. Verify token: lookup em wa_numbers.verify_token em vez de env var única
 *
 * Não usar `// TODO(ADR-028)` segundo a doutrina · isso é débito FORMALIZADO.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { WhatsAppCloudService } from '@/services/whatsapp-cloud';
import { checkGuard } from '@/lib/guard';
import { generateResponse, getFixedResponse } from '@/services/ai.service';
import { transcribeAudio } from '@/services/transcription.service';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

// ── GET: Webhook verification ────────────────────────────────
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return new Response(challenge || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.error('❌ Webhook verification failed');
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

        for (const message of value.messages) {
          await processInboundMessage(message, value.contacts);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ── Process a single inbound message ─────────────────────────
async function processInboundMessage(message: any, contacts: any[]) {
  const supabase = createServerClient();
  const wa = new WhatsAppCloudService();
  const phone = message.from;
  const pushName = contacts?.[0]?.profile?.name || '';

  // 1. Mark as read immediately
  wa.markAsRead(message.id);

  // 2. Find or create lead
  let { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!lead) {
    const { data: newLead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        id: uuidv4(),
        clinic_id: '00000000-0000-0000-0000-000000000001',
        phone,
        name: pushName || null,
        phase: 'lead',
        temperature: 'warm',
        ai_persona: 'onboarder',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (leadErr) {
      console.error('[Webhook] Failed to create lead for', phone, leadErr);
      return;
    }
    lead = newLead;
  }

  // 3. Find or create conversation
  let { data: conv } = await supabase
    .from('wa_conversations')
    .select('*')
    .eq('phone', phone)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!conv) {
    const { data: newConv, error: convErr } = await supabase
      .from('wa_conversations')
      .insert({
        id: uuidv4(),
        clinic_id: '00000000-0000-0000-0000-000000000001',
        phone,
        lead_id: lead.id,
        display_name: pushName || lead.name || phone,
        status: 'active',
        ai_enabled: true,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();
      
    if (convErr) {
      console.error('[Webhook] Failed to create conversation for', phone, convErr);
      return;
    }
    conv = newConv;
  }

  // 4. Determine content type and extract text
  let contentType = message.type || 'text';
  let textContent = '';
  let mediaId: string | null = null;
  let mediaUrl: string | null = null;

  switch (contentType) {
    case 'text':
      textContent = message.text?.body || '';
      break;
    case 'image':
      textContent = message.image?.caption || '[imagem recebida]';
      mediaId = message.image?.id || null;
      break;
    case 'audio':
      textContent = '[audio recebido]'; // placeholder; será substituído pela transcrição abaixo
      mediaId = message.audio?.id || null;
      break;
    case 'video':
      textContent = '[video recebido]';
      mediaId = message.video?.id || null;
      break;
    case 'sticker':
      textContent = '[sticker recebido]';
      mediaId = message.sticker?.id || null;
      break;
    default:
      textContent = `[${contentType} recebido]`;
  }

  // 4.5 Auto-Detect Funnel if missing or generic
  const genericFunnels = [null, '', 'procedimentos', 'geral', 'Geral', 'Procedimentos Gerais'];
  if (lead && genericFunnels.includes(lead.funnel) && textContent && textContent.length > 5 && !textContent.startsWith('[')) {
    const txt = textContent.toLowerCase();
    const olheirasKeywords = ['olheira', 'olho', 'palpebra', 'pálpebra', 'cansada', 'escuro', 'escurec'];
    const fullFaceKeywords = ['ruga', 'flacidez', 'rosto', 'contorno', 'bigode', 'chinês', 'sulco', 'derretendo', 'papada', 'lifting', 'fio', 'bochecha', 'cai', 'caido', 'mancha'];
    
    let detectedFunnel = null;
    if (olheirasKeywords.some(k => txt.includes(k))) detectedFunnel = 'olheiras';
    else if (fullFaceKeywords.some(k => txt.includes(k))) detectedFunnel = 'fullface';

    if (detectedFunnel) {
      await supabase.from('leads').update({ funnel: detectedFunnel }).eq('id', lead.id);
      lead.funnel = detectedFunnel;
      console.log(`🎯 [NLP] Funil do lead ${phone} atualizado para: ${detectedFunnel}`);
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
          console.log(`🎙️ [Transcription] Transcrevendo áudio de ${phone}...`);
          const transcription = await transcribeAudio(
            mediaData.buffer,
            mediaData.contentType,
            `audio.${ext}`
          );

          if (transcription) {
            textContent = transcription;
            console.log(`🎙️ [Transcription] Áudio de ${phone} transcrito com sucesso.`);

            // 5.2 Re-rodar detecção de funil sobre o texto transcrito do áudio
            // (A detecção no passo 4.5 não consegue rodar porque textContent ainda era placeholder)
            const genericFunnels = [null, '', 'procedimentos', 'geral', 'Geral'];
            if (lead && genericFunnels.includes(lead.funnel) && transcription.length > 5) {
              const txt = transcription.toLowerCase();
              const olheirasKw = ['olheira', 'olho', 'palpebra', 'pálpebra', 'cansada', 'escuro', 'escurec'];
              const fullFaceKw = ['ruga', 'flacidez', 'rosto', 'contorno', 'bigode', 'chinês', 'sulco', 'derretendo', 'papada', 'lifting', 'fio', 'bochecha', 'cai', 'caido', 'mancha'];

              let detectedFunnel: string | null = null;
              if (olheirasKw.some(k => txt.includes(k))) detectedFunnel = 'olheiras';
              else if (fullFaceKw.some(k => txt.includes(k))) detectedFunnel = 'fullface';

              if (detectedFunnel) {
                await supabase.from('leads').update({ funnel: detectedFunnel }).eq('id', lead.id);
                lead.funnel = detectedFunnel;
                console.log(`🎯 [NLP/Audio] Funil do lead ${phone} atualizado via áudio para: ${detectedFunnel}`);
              }
            }
          } else {
            textContent = '[áudio recebido — transcrição indisponível]';
            console.warn(`[Transcription] Falha ao transcrever áudio de ${phone}.`);
          }
        }
      }
    } catch (err) {
      console.error('[Webhook] Media download/transcription failed:', err);
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
    console.log(`[Webhook] Mensagem idêntica detectada para ${phone}, ignorando retry da Meta`);
    return;
  }

  // 6. Save inbound message to DB
  const sentAtStr = new Date().toISOString();
  const { error: msgErr } = await supabase.from('wa_messages').insert({
    id: uuidv4(),
    clinic_id: '00000000-0000-0000-0000-000000000001',
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
    console.error('[Webhook] Failed to save inbound message:', msgErr);
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
    console.log(`[Debounce] Ignorando este processamento intermediário para ${phone}. A rota mais recente assumirá a IA.`);
    return;
  }

  // 7. Check guard — AI allowed to respond?
  const guard = await checkGuard(conv.id);
  if (!guard.allowed) {
    console.log(`[Guard] Blocked AI for ${phone}: ${guard.reason}`);
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

    console.log('\n=======================================');
    console.log(`🧠 [AI CALL DEBUG] Lead: ${lead.name || pushName}`);
    console.log(`🎯 [AI CALL DEBUG] Funil no Banco (Lead): ${lead.funnel || 'NULO/NÃO ATRIBUÍDO'}`);
    console.log('=======================================\n');

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
      },
      messages,
      currentMsgCount
    );
    console.log(`\n🤖 [AI RAW RESPONSE] ${phone}:\n${aiResponse}\n`);
  }

  // 10.5 Human HandOff (Pausa Automática)
  if (aiResponse.includes('[ACIONAR_HUMANO]')) {
    aiResponse = aiResponse.replace(/\[ACIONAR_HUMANO\]/g, '').trim();
    
    // Pausa a IA para este lead por 24 horas
    const pauseUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('wa_conversations').update({ 
      ai_paused_until: pauseUntil, 
      ai_enabled: false, 
      paused_by: 'human_handoff' 
    }).eq('id', conv.id);
    
    console.log(`⚠️ [HandOff] AI pausada por 24h via intenção de transbordo para ${phone}`);
  }

  // 10.5.5 Score and Tagging (Gatilhos de Qualificação)
  const scoreMatch = aiResponse.match(/\[SCORE:(\d+)\]/);
  if (scoreMatch) {
    const newScore = parseInt(scoreMatch[1], 10);
    aiResponse = aiResponse.replace(scoreMatch[0], '').trim();
    await supabase.from('leads').update({ lead_score: newScore }).eq('id', lead.id);
    console.log(`⭐ [Score] Lead ${phone} pontuado para ${newScore}`);
  }

  const tagMatch = aiResponse.match(/\[ADD_TAG:([^\]]+)\]/g);
  if (tagMatch) {
    for (const match of tagMatch) {
      const tagName = match.replace('[ADD_TAG:', '').replace(']', '').trim();
      aiResponse = aiResponse.replace(match, '').trim();
      
      // Busca tags atuais
      const { data: currentLead } = await supabase.from('leads').select('tags').eq('id', lead.id).single();
      const existingTags = currentLead?.tags || [];
      if (!existingTags.includes(tagName)) {
        await supabase.from('leads').update({ 
          tags: [...existingTags, tagName] 
        }).eq('id', lead.id);
        console.log(`🏷️ [Tag] Adicionada tag '${tagName}' para ${phone}`);
      }
    }
  }

  const funnelMatch = aiResponse.match(/\[SET_FUNNEL:(olheiras|fullface|procedimentos)\]/i);
  if (funnelMatch) {
    const newFunnel = funnelMatch[1].toLowerCase();
    aiResponse = aiResponse.replace(funnelMatch[0], '').trim();
    await supabase.from('leads').update({ funnel: newFunnel }).eq('id', lead.id);
    lead.funnel = newFunnel;
    console.log(`🎯 [AI Funnel] Lead ${phone} reclassificado para ${newFunnel}`);
  }

  // 10.6 Auto-Dispatch Mídias Ricas (Fotos)
  let sendResult: any = { ok: false };
  let outboundContentType = 'text';
  let outboundMediaUrl: string | null = null;
  
  // Extrai a tag inteligente de disparo de foto e o funil que a IA decidiu
  const photoMatch = aiResponse.match(/\s*\[ENVIAR_FOTO:(olheiras|fullface)\]\s*/i);
  
  // Tratamento de fallback clássico caso a IA desobedeça e envie a tag legada
  const legacyMatch = !photoMatch ? aiResponse.match(/\s*\[(?:ENVIAR_FOTO|FOTO:[^\]]+)\]\s*/i) : null;
  const activeMatch = photoMatch || legacyMatch;

  if (activeMatch) {
    let photoName = 'resultado.jpg'; // Usado primariamente para log caso a roleta falhe
    
    // Removemos a tag da resposta para não aparecer pro usuário
    let textWithoutTag = aiResponse.replace(activeMatch[0], '\n\n').trim();
    
    // Roteamento de Pasta Dinâmico: A tag da IA governa se existir, senão usa o banco, senão tenta deduzir
    let computedFunnel = 'olheiras'; // padrão
    if (photoMatch && photoMatch[1]) {
         computedFunnel = photoMatch[1].toLowerCase(); // 'olheiras' ou 'fullface' ditado pela IA
    } else {
         computedFunnel = lead?.funnel || (aiResponse.toLowerCase().includes('olheiras') ? 'olheiras' : 'fullface');
    }
    
    let basePath = 'before-after/olheiras';
    if (computedFunnel === 'olheiras') {
       basePath = process.env.BUCKET_FUNIL_OLHEIRAS || 'before-after/olheiras';
    } else {
       basePath = process.env.BUCKET_FUNIL_FULLFACE || 'before-after/fullface';
    }

    // ROLETA DE IMAGENS ALEATÓRIAS
    try {
      // 1. Tenta listar imagens da gaveta específica do funil
      let { data: files } = await supabase.storage.from('media').list(basePath);
      let validFiles = files?.filter(f => f.name.match(/\.(jpg|jpeg|png)$/i)) || [];
      
      // 2. Puxa a foto randômica
      if (validFiles.length > 0) {
         const randomIndex = Math.floor(Math.random() * validFiles.length);
         photoName = validFiles[randomIndex].name; 
      } else {
         console.log(`[Roleta] Nenhuma foto válida encontrada em ${basePath}.`);
      }
    } catch (e) {
       console.log('Erro ao sortear imagem, caindo pro nome padrão...');
    }
    
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(`${basePath}/${photoName}`);
    
    if (urlData?.publicUrl) {
       console.log(`📸 [Media] Enviando foto ${photoName} para ${phone}`);
       sendResult = await wa.sendImage(phone, urlData.publicUrl, textWithoutTag);
       
       aiResponse = textWithoutTag;
       outboundContentType = 'image';
       outboundMediaUrl = urlData.publicUrl;
    } else {
       aiResponse = textWithoutTag;
       sendResult = await wa.sendText(phone, aiResponse);
    }
  } else {
    // 11. Send response via WhatsApp (Somente Texto)
    sendResult = await wa.sendText(phone, aiResponse);
  }

  // 12. Save outbound message to DB
  await supabase.from('wa_messages').insert({
    id: uuidv4(),
    clinic_id: '00000000-0000-0000-0000-000000000001',
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

  console.log(`✅ [${phone}] AI responded (${aiResponse.length} chars)`);
}
