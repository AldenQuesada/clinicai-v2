/**
 * POST /api/diag/simulate-inbound
 * Diag temporario · simula payload Meta inbound bypass signature ·
 * usa pra testar fluxo Cloud webhook end-to-end sem precisar Meta real.
 *
 * REMOVER apos diag (security risk · sem auth).
 *
 * Auth: x-diag-secret header · qualquer valor (so pra evitar abuse acidental).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { makeRepos } from '@/lib/repos';
import { resolveLead, resolveConversation } from '@/lib/webhook/lead-conversation';
import { resolveTenantContext } from '@/lib/webhook/tenant-resolve';
import { isInternalWaNumber } from '@/lib/webhook/internal-phone';
import { sanitizeWebhookLogBody } from '@/lib/webhook/sanitize-webhook-log';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Hard guard 2026-05-07 · audit pattern channel='cloud' + sender='user'
  // + provider_msg_id NULL em conv Mih/Secretaria. Endpoint diag escreve
  // direto em wa_messages sem providerMsgId/waMessageId/channel · cai em
  // defaults da DDL · contamina convs reais quando rodado em prod.
  // Em dev local segue funcional pra E2E testing.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'disabled_in_production' }, { status: 403 });
  }

  const headerSecret = request.headers.get('x-diag-secret');
  if (headerSecret !== 'simulate-inbound-2026-05-04') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const phoneNumberId = body?.phone_number_id || '1073862819146770'; // Lara default
  const fromPhone = body?.from || '554498787673';
  const text = body?.text || `DIAG_SIMULATE_${Date.now()}`;
  const pushName = body?.push_name || 'Diag Probe';

  const supabase = createServerClient();
  const repos = makeRepos(supabase);

  const traceLog = async (stage: string, extra: Record<string, unknown> = {}) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('wa_webhook_log').insert({
        endpoint: '/api/diag/simulate-inbound',
        method: 'POST',
        signature_ok: true,
        signature_reason: 'simulate:' + stage,
        phone_number_id: phoneNumberId,
        from_phone: fromPhone,
        message_text: text.slice(0, 200),
        message_type: 'text',
        raw_body: sanitizeWebhookLogBody(JSON.stringify(extra)).slice(0, 4000),
        result_status: 200,
        result_summary: 'simulate_stage:' + stage,
      });
    } catch { /* silent */ }
  };

  try {
    await traceLog('start');

    const { clinic_id, wa_number_id } = await resolveTenantContext(supabase, phoneNumberId);
    await traceLog('after_resolveTenantContext', { clinic_id, wa_number_id });

    // Guard universal · audit 2026-05-05 substituiu guard antigo que filtrava
    // is_active=true · agora bloqueia QUALQUER phone presente em wa_numbers
    // do clinic_id (active OU inactive).
    const internalCheck = await isInternalWaNumber(supabase, clinic_id, fromPhone);
    await traceLog('guard_check', {
      phone_last4: fromPhone.replace(/\D/g, '').slice(-4),
      internal: internalCheck.internal,
      reason: internalCheck.reason,
      match_label: internalCheck.label,
    });
    if (internalCheck.internal) {
      return NextResponse.json({
        ok: true,
        blocked: 'internal_wa_number',
        label: internalCheck.label,
        inbox_role: internalCheck.inboxRole,
        number_type: internalCheck.numberType,
        is_active: internalCheck.isActive,
      });
    }

    await traceLog('before_resolveLead');
    const lead = await resolveLead({ leads: repos.leads, clinic_id, phone: fromPhone, pushName, supabase });
    if (!lead) {
      await traceLog('resolveLead_returned_null');
      return NextResponse.json({ ok: false, error: 'resolveLead_null' }, { status: 500 });
    }
    await traceLog('after_resolveLead', { lead_id: lead.id });

    const conv = await resolveConversation({
      conversations: repos.conversations,
      clinic_id,
      phone: fromPhone,
      lead,
      pushName,
      waNumberId: wa_number_id,
      supabase,
    });
    if (!conv) {
      await traceLog('resolveConversation_returned_null');
      return NextResponse.json({ ok: false, error: 'resolveConversation_null' }, { status: 500 });
    }
    await traceLog('after_resolveConversation', {
      conv_id: conv.id,
      wa_number_id: conv.waNumberId,
      inbox_role: conv.inboxRole,
    });

    await traceLog('before_saveInbound', { content: text.slice(0, 80) });
    const inboundId = await repos.messages.saveInbound(clinic_id, {
      conversationId: conv.id,
      phone: fromPhone,
      content: text,
      contentType: 'text',
      sentAt: new Date().toISOString(),
    });
    if (!inboundId) {
      await traceLog('saveInbound_returned_null', { conv_id: conv.id });
      return NextResponse.json({ ok: false, error: 'saveInbound_null', conv_id: conv.id }, { status: 500 });
    }
    await traceLog('after_saveInbound', { msg_id: inboundId });

    return NextResponse.json({
      ok: true,
      stages_completed: 'all',
      conv_id: conv.id,
      msg_id: inboundId,
      lead_id: lead.id,
      wa_number_id: conv.waNumberId,
      inbox_role: conv.inboxRole,
    });
  } catch (err) {
    const errMsg = (err as Error)?.message || 'unknown';
    await traceLog('exception', { err: errMsg, stack: (err as Error)?.stack?.slice(0, 500) });
    return NextResponse.json({ ok: false, error: 'exception', err: errMsg }, { status: 500 });
  }
}
