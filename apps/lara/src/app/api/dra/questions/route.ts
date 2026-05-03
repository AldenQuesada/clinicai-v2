/**
 * GET /api/dra/questions?status=pending
 *
 * Lista perguntas pendentes pra Dra. responder.
 * Default: status='pending' (apenas as que ela ainda não respondeu).
 *
 * Acesso: role admin/owner (Dra. é owner da clínica).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { ctx } = await loadServerReposContext();
    if (!can(ctx.role, 'lara:edit-config')) {
      // só admin/owner respondem perguntas (proxy: tem permissão pra editar config)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const status = new URL(request.url).searchParams.get('status') || 'pending';
    const supabase = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('conversation_questions')
      .select('*')
      .eq('clinic_id', ctx.clinic_id)
      .eq('status', status)
      .order('asked_at', { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich · pega lead name + phone pra UI mostrar contexto sem mais 1 query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data ?? []) as any[];
    const leadIds = Array.from(new Set(items.map((i) => i.lead_id).filter(Boolean)));
    let leadsMap: Record<string, { name: string | null; phone: string }> = {};
    if (leadIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (supabase as any)
        .from('leads')
        .select('id, name, phone')
        .in('id', leadIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of (leads ?? []) as any[]) {
        leadsMap[l.id] = { name: l.name, phone: l.phone };
      }
    }

    return NextResponse.json({
      items: items.map((q) => ({
        ...q,
        lead_name: q.lead_id ? leadsMap[q.lead_id]?.name ?? null : null,
        lead_phone: q.lead_id ? leadsMap[q.lead_id]?.phone ?? null : null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error)?.message || 'unknown' }, { status: 500 });
  }
}
