/**
 * GET /api/conversations · lista conversas pro inbox.
 *
 * ADR-012: ConversationRepository.listByStatus + LeadRepository.findByPhones.
 * Multi-tenant ADR-028: clinic_id resolvido via JWT (loadServerContext).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
import type { StatusFilter } from '@clinicai/repositories';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { supabase, ctx } = await loadServerContext();
    const repos = makeRepos(supabase);

    const { searchParams } = new URL(request.url);
    const statusParam = (searchParams.get('status') || 'active') as StatusFilter;

    const conversations = await repos.conversations.listByStatus(ctx.clinic_id, statusParam);

    // Resolve leads em batch (1 query) · evita N+1 e mantem inbox rapido
    const phones = conversations.map((c) => c.phone).filter(Boolean);
    const leadsByPhone = await repos.leads.findByPhones(ctx.clinic_id, phones);

    const enriched = conversations.map((c) => {
      const lead = leadsByPhone.get(c.phone);

      // remote_jid presente = legacy Evolution · null = Cloud (canal novo)
      const isCloud = !c.remoteJid;

      return {
        conversation_id: c.id,
        phone: c.phone,
        lead_name: lead?.name || c.displayName || c.phone,
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
      };
    });

    return NextResponse.json(enriched);
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
