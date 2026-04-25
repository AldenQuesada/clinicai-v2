/**
 * GET /api/conversations — List all active conversations for inbox
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // 1. Fetch conversations with optional status filter
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') || 'active';
    
    let statusFilter: string[] = ['active', 'paused'];
    if (statusParam === 'archived') statusFilter = ['archived'];
    if (statusParam === 'resolved') statusFilter = ['resolved'];
    if (statusParam === 'dra') statusFilter = ['dra'];

    const { data: convData, error: convError } = await supabase
      .from('wa_conversations')
      .select('*')
      .in('status', statusFilter)
      .order('last_message_at', { ascending: false });

    if (convError) {
      console.error('[API] Conversations error:', convError);
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    // 2. Fetch related leads using both lead_id and phone (safest fallback)
    const phones = (convData || []).map((c: any) => c.phone).filter(Boolean);
    
    let leadsById: Record<string, any> = {};
    let leadsByPhone: Record<string, any> = {};
    
    if (phones.length > 0) {
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, name, phone, phase, temperature, funnel, queixas_faciais, ai_persona, lead_score, tags')
        .in('phone', phones);
        
      if (leadsData) {
        leadsData.forEach((l: any) => {
          leadsById[l.id] = l;
          leadsByPhone[l.phone] = l;
        });
      }
    }

    // 3. Transform and Merge
    const conversations = (convData || []).map((c: any) => {
      const lead = (c.lead_id ? leadsById[c.lead_id] : null) || leadsByPhone[c.phone];
      
      /**
       * IDENTIFICADOR DE CANAL (Evolution vs Cloud)
       * A Evolution API (projeto antigo) sempre preenche o campo 'remote_jid' (ex: 5511...@s.whatsapp.net).
       * A nossa nova Cloud API deixa este campo NULL, usando apenas o ID interno e o Telefone.
       */
      const isCloud = !c.remote_jid;

      return {
        conversation_id: c.id,
        phone: c.phone,
        lead_name: lead?.name || c.display_name || c.phone,
        lead_id: c.lead_id || lead?.id,
        status: c.status,
        ai_enabled: c.ai_enabled,
        ai_paused_until: c.ai_paused_until,
        last_message_at: c.last_message_at,
        last_message_text: c.last_message_text,
        last_lead_msg: c.last_lead_msg,
        funnel: lead?.funnel || null,
        phase: lead?.phase || null,
        temperature: lead?.temperature || null,
        queixas: lead?.queixas_faciais || [],
        tags: lead?.tags || [],
        lead_score: lead?.lead_score || 0,
        channel: isCloud ? 'cloud' : 'legacy',
        is_urgent: isUrgent(c),
      };
    });

    return NextResponse.json(conversations);
  } catch (err: any) {
    console.error('[API] Conversations error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function isUrgent(conv: any): boolean {
  if (!conv.last_lead_msg) return false;
  const lastMsg = new Date(conv.last_lead_msg);
  const minutesAgo = (Date.now() - lastMsg.getTime()) / 60000;
  return !conv.ai_enabled && minutesAgo > 5;
}
