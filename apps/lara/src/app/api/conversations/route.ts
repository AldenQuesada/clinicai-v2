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
import { loadSecretariaInbox } from '@/lib/wa-chat-sync/secretaria-inbox';

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

    // Commit 2 (mig 133/134) · branch /secretaria lê wa_chat_mirror (espelho
    // Evolution Mih sincronizado por pg_cron 1min). Mostra ordem REAL do
    // WhatsApp · grupos + LIDs + chats sem wa_conversations. Bypassa o
    // listByStatus tradicional · não usa wa_conversations_operational_view.
    if (inboxRole === 'secretaria') {
      const { items: mirrorItems, nextCursor } = await loadSecretariaInbox(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase as any,
        ctx.clinic_id,
        { limit, beforeIso },
      );

      // Mapeia SecretariaInboxItem → shape compatível com Conversation interface
      // do UI (useConversations.ts). Defaults pra campos que mirror-only não
      // tem (response_color/SLA/lead/funil/...). UI desabilita ações em rows
      // mirror-only via has_conversation=false / conversation_id=null.
      const items = mirrorItems.map((m) => ({
        // Identificação (nullable conv_id pra mirror-only)
        conversation_id: m.conversation_id,
        phone: m.phone ?? '',
        lead_name: m.display_name,
        display_name: m.display_name,
        lead_id: m.lead_id,
        status: m.status,
        ai_enabled: m.ai_enabled,
        ai_paused_until: m.ai_paused_until,
        last_message_at: m.last_message_at,
        last_message_text: m.last_message_text,
        last_lead_msg: null,
        is_urgent: false,
        phase: null,
        funnel: null,
        lead_score: 0,
        tags: [],
        queixas: [],
        channel: 'legacy',
        assigned_to: null,
        assigned_at: null,
        inbox_role: m.inbox_role ?? 'secretaria',
        handoff_to_secretaria_at: null,
        last_patient_msg_at: null,
        last_human_reply_at: null,
        last_human_reply_text: null,
        waiting_human_response: false,
        minutes_waiting: null,
        response_color: 'respondido' as const,
        should_pulse: false,
        pulse_behavior: 'none' as const,
        // Operational view defaults (não temos enrichment pra mirror-only)
        operational_owner: null,
        operational_owner_label: null,
        is_luciana: false,
        is_dra: false,
        is_lara: false,
        is_voce: false,
        is_mira: false,
        is_secretaria: true,
        is_aguardando: false,
        is_urgente: false,
        is_assigned: false,
        assigned_to_name: null,
        assigned_to_role: null,
        has_legacy_operational_tag: false,
        op_response_color: 'none' as const,
        last_inbound_msg: null,
        last_human_msg: null,
        last_lara_msg: null,
        last_outbound_msg: null,
        minutes_since_last_inbound: null,
        // Mirror-specific (Commit 2)
        has_conversation: m.has_conversation,
        mirror_remote_jid: m.mirror_remote_jid,
        mirror_remote_kind: m.mirror_remote_kind,
        is_group: m.is_group,
        is_lid: m.is_lid,
        unread_count: m.unread_count,
        last_message_type: m.last_message_type,
        last_message_from_me: m.last_message_from_me,
        display_name_resolved: m.display_name,
        wa_number_id: m.wa_number_id,
        context_type: m.context_type,
      }));

      return NextResponse.json({ items, nextCursor });
    }

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

    // ── Enrichment via view operacional ──────────────────────────────────
    // Single source of truth pra pills/filas (db/migrations/...127). Mergeia
    // os 21 campos derivados (operational_owner, is_dra, is_lara, is_aguardando,
    // is_urgente, response_color, etc) sem alterar a query principal · zero
    // breaking change pra callers existentes.
    const conversationIds = items.map((i) => i.conversation_id);
    type OperationalRow = {
      id: string;
      is_aguardando: boolean | null;
      is_urgente: boolean | null;
      response_color: string | null;
      is_assigned: boolean | null;
      assigned_to_name: string | null;
      assigned_to_role: string | null;
      is_dra: boolean | null;
      is_lara: boolean | null;
      is_voce: boolean | null;
      is_secretaria: boolean | null;
      is_mira: boolean | null;
      is_luciana: boolean | null;
      operational_owner: string | null;
      operational_owner_label: string | null;
      has_legacy_operational_tag: boolean | null;
      last_inbound_msg: string | null;
      last_human_msg: string | null;
      last_lara_msg: string | null;
      last_outbound_msg: string | null;
      minutes_since_last_inbound: number | null;
    };
    const opMap = new Map<string, OperationalRow>();
    if (conversationIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: opData } = await (supabase as any)
        .from('wa_conversations_operational_view')
        .select(
          'id, is_aguardando, is_urgente, response_color, is_assigned, ' +
          'assigned_to_name, assigned_to_role, is_dra, is_lara, is_voce, ' +
          'is_secretaria, is_mira, is_luciana, operational_owner, ' +
          'operational_owner_label, has_legacy_operational_tag, ' +
          'last_inbound_msg, last_human_msg, last_lara_msg, last_outbound_msg, ' +
          'minutes_since_last_inbound',
        )
        .in('id', conversationIds);
      for (const row of (opData ?? []) as OperationalRow[]) {
        opMap.set(String(row.id), row);
      }
    }

    const enrichedItems = items.map((item) => {
      const op = opMap.get(item.conversation_id);
      if (!op) return item;
      return {
        ...item,
        // Operational owner canon (Alden 2026-05-05)
        operational_owner: op.operational_owner ?? null,
        operational_owner_label: op.operational_owner_label ?? null,
        is_luciana: op.is_luciana ?? false,
        // Pills derivados (booleanos · não conflitam com SLA secretária)
        is_dra: op.is_dra ?? false,
        is_lara: op.is_lara ?? false,
        is_voce: op.is_voce ?? false,
        is_mira: op.is_mira ?? false,
        is_secretaria: op.is_secretaria ?? false,
        is_aguardando: op.is_aguardando ?? false,
        is_urgente: op.is_urgente ?? false,
        is_assigned: op.is_assigned ?? false,
        assigned_to_name: op.assigned_to_name ?? null,
        assigned_to_role: op.assigned_to_role ?? null,
        has_legacy_operational_tag: op.has_legacy_operational_tag ?? false,
        // NÃO sobrescreve `response_color` · campo já existe no DTO com
        // semântica do SLA secretária (verde/amarelo/atrasado_fixo/etc).
        // Pills/filas usam `is_urgente` (boolean) · sem ambiguidade.
        // Expomos a versão da view como `op_response_color` pra audit/debug:
        op_response_color: op.response_color ?? 'none',
        // Timestamps derivados (last_*) · vem do msg_rollup da view
        last_inbound_msg: op.last_inbound_msg ?? null,
        last_human_msg: op.last_human_msg ?? null,
        last_lara_msg: op.last_lara_msg ?? null,
        last_outbound_msg: op.last_outbound_msg ?? null,
        minutes_since_last_inbound: op.minutes_since_last_inbound ?? null,
      };
    });

    // Cursor pra proxima pagina · null quando lote veio menor que limit
    const nextCursor =
      enrichedItems.length === limit ? enrichedItems[enrichedItems.length - 1].last_message_at : null;

    return NextResponse.json({ items: enrichedItems, nextCursor });
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
