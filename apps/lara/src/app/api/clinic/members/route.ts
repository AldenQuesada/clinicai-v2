/**
 * GET /api/clinic/members · lista usuarios ativos da clinic do caller,
 * id do user logado e clinic_id (pra UI montar canais Realtime sem
 * precisar de outro endpoint).
 *
 * P-12 multi-atendente · alimenta dropdown de assignment + presence avatares.
 *
 * ADR-012: ProfileRepository.listByClinic.
 * Multi-tenant ADR-028: clinic_id via JWT (loadServerReposContext).
 *
 * Resposta:
 *   {
 *     items: [{ id, fullName, firstName, lastName, role, avatarUrl, isActive }],
 *     me: 'uuid-do-user-logado' | null,
 *     clinic_id: 'uuid-da-clinic' | null
 *   }
 */

import { NextResponse } from 'next/server';
import { loadServerReposContext } from '@/lib/repos';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { ctx, repos } = await loadServerReposContext();
    const members = await repos.profiles.listByClinic(ctx.clinic_id);
    return NextResponse.json({
      items: members,
      me: ctx.user_id ?? null,
      clinic_id: ctx.clinic_id ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[API] Clinic members error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
