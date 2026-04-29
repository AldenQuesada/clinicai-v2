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
  let wa_number_id: string | null;
  if (body.clinic_id) {
    clinic_id = body.clinic_id;
    wa_number_id = body.wa_number_id || null;
  } else {
    // ADR-028: resolve via wa_numbers se possivel · default Mirian (LARA_TENANT_FAILFAST=false)
    const ctx = await resolveTenantContext(supabase, null);
    clinic_id = ctx.clinic_id;
    wa_number_id = ctx.wa_number_id;
    if (body.wa_number_id) wa_number_id = body.wa_number_id;
  }

  // 2. WhatsApp service per-tenant (audit N7) · fallback env global
  let wa: WhatsAppCloudService | null = null;
  if (wa_number_id) {
    wa = await createWhatsAppCloudFromWaNumber(supabase, wa_number_id);
  }
  if (!wa) {
    wa = new WhatsAppCloudService({
      wa_number_id: wa_number_id || 'fallback-env',
      clinic_id,
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      access_token: process.env.WHATSAPP_ACCESS_TOKEN || '',
    });
  }

  // 3. Resolve/create lead + conversation (ADR-012)
  let lead = await repos.leads.findByPhoneVariants(clinic_id, [phone]);
  if (!lead) {
    lead = await repos.leads.create(clinic_id, { phone, name: body.name });
  }
  if (!lead) {
    log.error({ clinic_id, phone_hash: hashPhone(phone) }, 'cold_open.lead.failed');
    return NextResponse.json({ ok: false, error: 'lead_create_failed' }, { status: 500 });
  }

  let conv = await repos.conversations.findActiveByPhoneVariants(clinic_id, [phone]);
  if (!conv) {
    conv = await repos.conversations.create(clinic_id, {
      phone,
      leadId: lead.id,
      displayName: body.name,
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
    // Mesmo se send falhou, salva outbound como 'failed' pra audit trail
    await repos.messages
      .saveOutbound(clinic_id, {
        conversationId: conv.id,
        sender: 'lara',
        content: messageText,
        contentType: 'text',
        status: 'failed',
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
