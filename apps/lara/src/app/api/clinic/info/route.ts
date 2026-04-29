/**
 * GET /api/clinic/info · dados leves da clinica (nome + responsavel).
 *
 * Resolve P-08 · UI de transfer le `responsibleName` em vez de hardcoded
 * "Dra. Mirian". Multi-tenant safe via JWT clinic_id.
 *
 * Uso: useClinicInfo() · cache local (dados nao mudam dentro da sessao).
 */

import { NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const clinic = await repos.clinic.getById(ctx.clinic_id)

    return NextResponse.json({
      id: clinic?.id ?? ctx.clinic_id,
      name: clinic?.name ?? 'Clínica',
      responsibleName: clinic?.responsibleName ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Clinic info error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
