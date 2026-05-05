/**
 * GET /api/conversations · lista conversas pro inbox.
 *
 * ADR-012: ConversationRepository.listByStatus + LeadRepository.findByPhones.
 * Multi-tenant ADR-028: clinic_id resolvido via JWT (loadServerContext).
 *
 * Query params (P-02 · 2026-04-29):
 *   ?status=active|archived|resolved|dra (default: active)
 *   ?limit=N            (default 50, max 200)
 *   ?before=<ISO>       (cursor · last_message_at < before)
 *
 * Resposta:
 *   {
 *     items: Array<conversation>,
 *     nextCursor: string | null  // ISO de last_message_at do ultimo item
 *                                  ou null se nao tem mais (items < limit)
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
import type { StatusFilter } from '@clinicai/repositories';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    const { supabase, ctx } = await loadServerContext();
    const repos = makeRepos(supabase);

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') || 'active') as StatusFilter;
    const beforeIso = searchParams.get('before') || undefined;
    const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

    // Mig 91 · ?inbox=sdr|secretaria (default 'sdr' · /conversas mostra SDR,
    // /secretaria mostra inbox 'secretaria'). Aplicado server-side no query
    // pra paginacao cursor funcionar corretamente.
    const inboxParam = searchParams.get('inbox');
    const inboxRole: 'sdr' | 'secretaria' = inboxParam === 'secretaria' ? 'secretaria' : 'sdr';

    const conversations = await repos.conversations.listByStatus(ctx.clinic_id, statusParam, {
      limit,
      beforeIso,
      inboxRole,
    });

    // Resolve leads em batch (1 query) · evita N+1 e mantem inbox rapido
    const phones = conversations.map((c) => c.phone).filter(Boolean);
    const leadsByPhone = await repos.leads.findByPhones(ctx.clinic_id, phones);

    const items = conversations.map((c) => {
      const lead = leadsByPhone.get(c.phone);

      // remote_jid presente = legacy Evolution · null = Cloud (canal novo)
      const isCloud = !c.remoteJid;

      return {
        conversation_id: c.id,
        phone: c.phone,
        // `lead_name` mantido com merge legacy (lead.name → displayName → phone)
        // pra retrocompat com callers que dependem de string non-null. Novos
        // consumidores devem usar `display_name` puro + helper
        // `getConversationDisplayName` (lib/displayName.ts) pra resolver nome
        // com fallback gracioso.
        lead_name: lead?.name || c.displayName || c.phone,
        // Mig 2026-05-05 · expõe wa_conversations.display_name (push_name) puro
        // pro helper de fallback do nome no card/header. Pode ser null quando
        // o paciente nunca enviou push_name pelo WhatsApp.
        display_name: c.displayName,
        lead_id: c.leadId || lead?.id || null,
        status: c.status,
        ai_enabled: c.aiEnabled,
        ai_paused_until: c.aiPausedUntil,
        last_message_at: c.lastMessageAt,
        last_message_text: c.lastMessageText,
        last_lead_msg: c.lastLeadMsg,
        funnel: lead?.funnel || null,
        phase: lead?.phase || null,
        temperature: lead?.temperature || null,
        queixas: lead?.queixasFaciais || [],
        tags: lead?.tags || [],
        lead_score: lead?.leadScore || 0,
        channel: isCloud ? 'cloud' : 'legacy',
        is_urgent: isUrgent(c.aiEnabled, c.lastLeadMsg),
        // P-12 · multi-atendente
        assigned_to: c.assignedTo,
        assigned_at: c.assignedAt,
        // Mig 91 · inbox routing + handoff Lara→Secretaria
        inbox_role: c.inboxRole,
        handoff_to_secretaria_at: c.handoffToSecretariaAt,
        // SLA · performance da secretaria (computado pelo repository · sla.ts)
        last_patient_msg_at: c.lastPatientMsgAt,
        last_human_reply_at: c.lastHumanReplyAt,
        // KPI Retorno · texto da última resposta humana (pra detectar
        // promessa de retorno via PROMISE_RE em lib/returnPromises.ts)
        last_human_reply_text: c.lastHumanReplyText,
        waiting_human_response: c.waitingHumanResponse,
        minutes_waiting: c.minutesWaiting,
        response_color: c.responseColor,
        should_pulse: c.shouldPulse,
        pulse_behavior: c.pulseBehavior,
      };
    });

    // Cursor pra proxima pagina · null quando lote veio menor que limit
    const nextCursor =
      items.length === limit ? items[items.length - 1].last_message_at : null;

    return NextResponse.json({ items, nextCursor });
  } catch (err: any) {
    console.error('[API] Conversations error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function isUrgent(aiEnabled: boolean, lastLeadMsg: string | null): boolean {
  if (!lastLeadMsg) return false;
  const lastMsg = new Date(lastLeadMsg);
  const minutesAgo = (Date.now() - lastMsg.getTime()) / 60000;
  return !aiEnabled && minutesAgo > 5;
}
