/**
 * POST /api/conversations/[id]/kpi-clear · "Encerrar" operacional da Secretaria.
 *
 * Seta wa_conversations.kpi_cleared_at = agora (via
 * ConversationRepository.clearSecretariaKpi). Limpa SÓ as lentes de KPI
 * (Aguardando/Urgente) — NÃO muda status, last_message_at, sort, nem remove
 * a conversa da inbox/timeline. Se o paciente falar de novo, o KPI reabre
 * automaticamente (regra na view, mig 200).
 *
 * Auth · multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext);
 * o repo escopa o UPDATE por id + clinic_id. Fail-closed em id inválido.
 */

import { NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'conversation id obrigatório' }, { status: 400 });
  }

  try {
    const { ctx, repos } = await loadServerReposContext();
    const result = await repos.conversations.clearSecretariaKpi(id, ctx.clinic_id);
    return NextResponse.json({
      ok: true,
      conversation_id: id,
      kpi_cleared_at: result.kpi_cleared_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] kpi-clear error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
