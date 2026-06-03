/**
 * POST   /api/conversations/[id]/pause — Pause agent for N minutes
 * DELETE /api/conversations/[id]/pause — Reactivate agent
 * GET    /api/conversations/[id]/pause — Get pause status
 *
 * Hardening (P1 backlog · 2026-06-03): espelha o /assume — valida JWT + clínica
 * (loadServerContext + getById + conv.clinicId === ctx.clinic_id) ANTES de
 * qualquer ação, porque o guard roda em service_role (RLS furada). Sem isso,
 * qualquer usuário autenticado que conheça um conversation_id pausava/reativava
 * a IA de conversa de outra clínica/tenant (ADR-028).
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerContext } from '@clinicai/supabase';
import { makeRepos } from '@/lib/repos';
import { createServerClient } from '@/lib/supabase';
import { pauseAgentScoped, reactivateAgentScoped, getPauseStatus } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** Valida que a conversa pertence à clínica do JWT antes de qualquer ação. */
async function loadScoped(id: string): Promise<{ clinicId: string; allowed: boolean }> {
  const { ctx } = await loadServerContext();
  const supabase = createServerClient();
  const repos = makeRepos(supabase);
  const conv = await repos.conversations.getById(id);
  return { clinicId: ctx.clinic_id, allowed: !!conv && conv.clinicId === ctx.clinic_id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { allowed } = await loadScoped(id);
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const status = await getPauseStatus(id);
  return NextResponse.json(status);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const duration = body.duration || 30; // default 30 min

  try {
    const { clinicId, allowed } = await loadScoped(id);
    if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const result = await pauseAgentScoped(id, clinicId, duration);
    return NextResponse.json({ success: true, pauseStatus: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log(`[PAUSE_API] Solicitando REATIVAÇÃO para id: ${id}`);

  try {
    const { clinicId, allowed } = await loadScoped(id);
    if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const result = await reactivateAgentScoped(id, clinicId);
    console.log(`[PAUSE_API] Sucesso ao reativar: ${id}`);
    return NextResponse.json({ success: true, pauseStatus: result });
  } catch (err: any) {
    console.error(`[PAUSE_API] ERRO ao reativar: ${id}`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
