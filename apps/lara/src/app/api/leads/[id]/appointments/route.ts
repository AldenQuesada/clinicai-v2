/**
 * GET /api/leads/[id]/appointments?upcoming=true
 *
 * Lista appointments de um lead. Default: histórico completo (max 50).
 * ?upcoming=true: só os agendamentos futuros (a partir de hoje).
 *
 * Roadmap A5 · usado pelo painel direito da /secretaria pra mostrar
 * próxima consulta sem trocar de tela.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: leadId } = await params;
    const { searchParams } = new URL(request.url);
    const upcomingOnly = searchParams.get('upcoming') === 'true';

    const { repos, ctx } = await loadServerReposContext();
    const all = await repos.appointments.listBySubject(ctx.clinic_id, { leadId }, { limit: 50 });

    let items = all;
    if (upcomingOnly) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      items = all.filter((a) => a.scheduledDate >= today && a.status !== 'cancelado' && a.status !== 'no_show');
    }

    // Ordena: futuros primeiro (asc) · histórico em descending stays
    items.sort((a, b) => {
      if (upcomingOnly) return a.scheduledDate.localeCompare(b.scheduledDate);
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });

    return NextResponse.json({
      items: items.map((a) => ({
        id: a.id,
        scheduled_date: a.scheduledDate,
        start_time: a.startTime,
        end_time: a.endTime,
        procedure: a.procedureName,
        professional: a.professionalName,
        status: a.status,
        value: a.value,
        consult_type: a.consultType,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Lead appointments error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
