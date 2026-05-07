/**
 * POST /api/cold-open · cold-open Lara após anatomy quiz.
 *
 * Audit gap B1-B7 (P0) · paridade com Lara legacy `lara-dispatch` edge function.
 * Substitui o pipeline antigo: anatomy_quiz_lara_dispatch → edge → Evolution.
 * Novo: caller (Quiz API) chama este endpoint → Cloud API direto Meta.
 *
 * Auth: header `x-cron-secret` ou `x-lara-cold-open-secret` · timing-safe via
 * @clinicai/utils. Usa COLD_OPEN_SECRET ou CRON_SECRET (back-compat).
 *
 * Payload:
 *   {
 *     phone: string,           // E.164 sem '+' (ex: '5544998782003')
 *     name: string,            // primeiro nome ou completo
 *     template_key: ColdOpenTemplateKey,
 *     queixas: [{ label: string, protocol?: string }],  // 2 principais primeiro
 *     context?: { lifecycle: { scheduled_for: string } },  // pra aq_agendado_futuro
 *     lifecycle?: string,      // contexto extra · opcional
 *     wa_number_id?: string,   // pra escolher canal Cloud API · opcional
 *     clinic_id?: string,      // override · default Mirian
 *     dispatch_id?: string,    // pra atualizar status em anatomy_quiz_lara_dispatch
 *   }
 *
 * Response 200: { ok: true, message_text, lead_id, conversation_id, message_id }
 * Response 401: auth falhou
 * Response 400: payload inválido
 * Response 500: erro interno (callAnthropic ou send falhou)
 *
 * Side-effects:
 *  - Cria/revive lead em `leads` (ADR-012)
 *  - Cria conversation em `conversations`
 *  - Salva outbound em `messages` com sentBy='lara'
 *  - Atualiza `anatomy_quiz_lara_dispatch` (se dispatch_id passado) · status='dispatched'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { makeRepos } from '@/lib/repos';
import { resolveTenantContext } from '@/lib/webhook/tenant-resolve';
import { isInternalWaNumber } from '@/lib/webhook/internal-phone';
import { WaNumberRepository } from '@clinicai/repositories';
import {
  createWhatsAppCloudFromWaNumber,
  WhatsAppCloudService,
} from '@clinicai/whatsapp';
import { validateCronSecret } from '@clinicai/utils';
import { createLogger, hashPhone } from '@clinicai/logger';
import {
  generateColdOpenMessage,
  COLD_OPEN_TEMPLATE_KEYS,
  type ColdOpenTemplateKey,
} from '@/services/cold-open.service';

const log = createLogger({ app: 'lara' });

export const dynamic = 'force-dynamic';

interface ColdOpenPayload {
  phone?: string;
  name?: string;
  template_key?: string;
  queixas?: Array<{ label?: string; protocol?: string }>;
  context?: { lifecycle?: { scheduled_for?: string } };
  lifecycle?: string;
  wa_number_id?: string;
  clinic_id?: string;
  dispatch_id?: string;
}

function isValidTemplateKey(k: unknown): k is ColdOpenTemplateKey {
  return typeof k === 'string' && (COLD_OPEN_TEMPLATE_KEYS as readonly string[]).includes(k);
}

export async function POST(req: NextRequest) {
  // Auth fail-CLOSED · timing-safe · aceita COLD_OPEN_SECRET ou CRON_SECRET
  const reject =
    validateCronSecret(req, 'COLD_OPEN_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET');
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status });
  }

  let body: ColdOpenPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (!body.phone || !body.name || !isValidTemplateKey(body.template_key)) {
    return NextResponse.json(
      { ok: false, error: 'missing_fields · phone, name, template_key required' },
      { status: 400 },
    );
  }

  const queixas = (body.queixas || [])
    .filter((q) => q && typeof q.label === 'string')
    .map((q) => ({ label: q.label as string, protocol: q.protocol }));
  if (queixas.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'queixas required · at least 1 item with label' },
      { status: 400 },
    );
  }

  const supabase = createServerClient();
  const repos = makeRepos(supabase);
  const phone = body.phone;

  // 1. Tenant: prefere body.clinic_id · senão resolve via wa_number_id · senão fallback Mirian
  let clinic_id: string;
  if (body.clinic_id) {
    clinic_id = body.clinic_id;
  } else {
    // ADR-028: resolve via wa_numbers se possivel · default Mirian (LARA_TENANT_FAILFAST=false)
    const ctx = await resolveTenantContext(supabase, null);
    clinic_id = ctx.clinic_id;
  }

  // 1.5 Resolução canônica do canal · cold-open SEMPRE sai pelo Lara SDR (Cloud).
  //
  // Audit 2026-05-07 (HIGH-1): cold-open antes podia criar wa_conversations
  // com wa_number_id=NULL (quando body.wa_number_id ausente E ctx.wa_number_id
  // não resolvia). Conv órfã ficava expostas a adopt-orphan (lead-conversation
  // .ts:172-184) e podia ser raptada pra qualquer canal Secretaria que aparecesse
  // primeiro · perdia rastro do funil Lara.
  //
  // Política nova: sempre resolver via listActive('lara_sdr') · fail closed se
  // não houver canal SDR configurado · sem fallback env global · sem canal
  // arbitrário do tenant ctx · body.wa_number_id é ignorado pra resolução
  // (continua aceito no payload por compat, mas warning logado se diverge).
  const waNumberRepo = new WaNumberRepository(supabase);
  const sdrCandidates = await waNumberRepo.listActiveByDefaultContextType(
    clinic_id,
    'lara_sdr',
  );
  if (sdrCandidates.length === 0) {
    log.error(
      { clinic_id, phone_hash: hashPhone(phone) },
      'cold_open.no_lara_sdr_channel · No active lara_sdr WhatsApp number configured for cold-open',
    );
    return NextResponse.json(
      { ok: false, error: 'No active lara_sdr WhatsApp number configured for cold-open' },
      { status: 409 },
    );
  }
  const laraWaNumber = sdrCandidates[0];
  const wa_number_id: string = laraWaNumber.id;
  if (body.wa_number_id && body.wa_number_id !== wa_number_id) {
    log.warn(
      {
        clinic_id,
        phone_hash: hashPhone(phone),
        body_wa_number_id: body.wa_number_id,
        resolved_wa_number_id: wa_number_id,
      },
      'cold_open.body_wa_number_id_ignored · using canonical lara_sdr channel',
    );
  }
  log.info(
    {
      clinic_id,
      wa_number_id,
      default_context_type: 'lara_sdr',
    },
    'cold_open.wa_number_resolved',
  );

  // Guard universal · cold-open jamais dispara campanha pra próprio wa_number
  // (ativo OU inativo). Audit 2026-05-05 · evita lead/conversa cruzada com
  // Mira/Marci/Mih/Secretaria.
  const internalCheck = await isInternalWaNumber(supabase, clinic_id, phone);
  if (internalCheck.internal) {
    log.warn(
      {
        clinic_id,
        phone_hash: hashPhone(phone),
        own_label: internalCheck.label,
        own_role: internalCheck.inboxRole,
        own_type: internalCheck.numberType,
        own_active: internalCheck.isActive,
      },
      'cold_open.skip_internal_wa_number',
    );
    return NextResponse.json({
      ok: false,
      blocked: 'internal_wa_number',
      label: internalCheck.label,
    }, { status: 422 });
  }

  // 2. WhatsApp service per-tenant (audit N7) · sem fallback env global
  // (canal já foi resolvido como lara_sdr canônico no passo 1.5).
  const wa: WhatsAppCloudService | null = await createWhatsAppCloudFromWaNumber(
    supabase,
    wa_number_id,
  );
  if (!wa) {
    log.error(
      { clinic_id, phone_hash: hashPhone(phone), wa_number_id },
      'cold_open.wa_service.create_failed · resolved lara_sdr channel has incomplete credentials',
    );
    return NextResponse.json(
      { ok: false, error: 'wa_service_unavailable · lara_sdr channel missing credentials' },
      { status: 500 },
    );
  }

  // 3. Resolve/create lead + conversation (ADR-012) · scopeado por canal Lara SDR
  let lead = await repos.leads.findByPhoneVariants(clinic_id, [phone]);
  if (!lead) {
    lead = await repos.leads.create(clinic_id, { phone, name: body.name });
  }
  if (!lead) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'cold_open.lead.failed');
    return NextResponse.json({ ok: false, error: 'lead_create_failed' }, { status: 500 });
  }

  // Lookup scopeado por waNumberId · evita pegar conv de outro canal pelo phone.
  // Create sempre com waNumberId · fecha buraco de conv órfã pré-mig 138.
  let conv = await repos.conversations.findActiveByPhoneVariants(
    clinic_id,
    [phone],
    wa_number_id,
  );
  if (!conv) {
    conv = await repos.conversations.create(clinic_id, {
      phone,
      leadId: lead.id,
      displayName: body.name,
      waNumberId: wa_number_id,
    });
  }
  if (!conv) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'cold_open.conversation.failed');
    return NextResponse.json({ ok: false, error: 'conversation_create_failed' }, { status: 500 });
  }

  // 4. Gera mensagem via Claude Haiku · audit gap B8 retorna template metadata (A/B testing)
  const generated = await generateColdOpenMessage(supabase, {
    templateKey: body.template_key as ColdOpenTemplateKey,
    name: body.name,
    queixas,
    context: body.context,
    clinicId: clinic_id,
    lifecycle: body.lifecycle ?? null,
  });

  const messageText = generated.messageText;
  if (!messageText) {
    return NextResponse.json(
      { ok: false, error: 'ai_generation_failed' },
      { status: 500 },
    );
  }

  // 5. Envia via Cloud API
  const sendResult = await wa.sendText(phone, messageText);

  if (!sendResult.ok) {
    log.error(
      { clinic_id, phone_hash: hashPhone(phone), template_key: body.template_key, err: sendResult.error },
      'cold_open.send.failed',
    );
    // Mesmo se send falhou, salva outbound como 'failed' pra audit trail.
    // Audit 2026-05-05: marca channel='cloud' (cold-open só usa Cloud) pra
    // analytics e UI agruparem corretamente · sem provider_msg_id porque
    // Meta nem chegou a aceitar (send falhou antes de retornar wamid).
    await repos.messages
      .saveOutbound(clinic_id, {
        conversationId: conv.id,
        sender: 'lara',
        content: messageText,
        contentType: 'text',
        status: 'failed',
        channel: 'cloud',
      })
      .catch(() => null);
    return NextResponse.json(
      { ok: false, error: 'whatsapp_send_failed', detail: sendResult.error },
      { status: 500 },
    );
  }

  // 6. Salva outbound
  const messageId = await repos.messages
    .saveOutbound(clinic_id, {
      conversationId: conv.id,
      sender: 'lara',
      content: messageText,
      contentType: 'text',
      status: 'sent',
      providerMsgId: sendResult.messageId ?? null,
      waMessageId: sendResult.messageId ?? null,
      channel: 'cloud',
    })
    .catch(() => null);

  // 7. Atualiza anatomy_quiz_lara_dispatch se dispatch_id passado · audit gap B8 salva
  // template_id/version/variant pra tracking de qual variante converteu melhor.
  // Camada 10b · usa RPC anatomy_quiz_lara_dispatch_mark (mig 800-83) em vez
  // de UPDATE direto · respeita boundary ADR-005 e centraliza whitelist de status.
  if (body.dispatch_id) {
    const { error: markError } = await supabase.rpc('anatomy_quiz_lara_dispatch_mark', {
      p_dispatch_id: body.dispatch_id,
      p_status: 'dispatched',
      p_message_text: messageText,
      p_template_id: generated.templateId ?? undefined,
      p_template_version: generated.templateVersion ?? undefined,
      p_template_variant: generated.templateVariant ?? undefined,
    });
    if (markError) {
      log.warn(
        { clinic_id, dispatch_id: body.dispatch_id, err: markError.message },
        'cold_open.dispatch.update.failed',
      );
      // Nao falha · cold-open ja foi enviado · update de status e nao critico
    }
  }

  log.info(
    {
      clinic_id, phone_hash: hashPhone(phone), template_key: body.template_key,
      lead_id: lead.id, message_id: messageId,
      template_source: generated.source,
      template_variant: generated.templateVariant,
    },
    'cold_open.dispatched',
  );

  return NextResponse.json({
    ok: true,
    message_text: messageText,
    lead_id: lead.id,
    conversation_id: conv.id,
    message_id: messageId,
    template_key: body.template_key,
    template_id: generated.templateId,
    template_version: generated.templateVersion,
    template_variant: generated.templateVariant,
    template_source: generated.source,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'lara-cold-open',
    version: '0.1.0',
    supported_templates: COLD_OPEN_TEMPLATE_KEYS,
  });
}
