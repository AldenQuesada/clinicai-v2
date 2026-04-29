/**
 * GET /api/templates/quick · lista templates ativos pro Quick Templates dropdown
 * (W-09 · SC-02). Consumido pelo `useQuickTemplates` no /conversas MessageArea.
 *
 * ADR-012: TemplateRepository.listActive (reuso · NAO duplica logica).
 * ADR-028: clinic_id resolvido via JWT (loadServerReposContext).
 *
 * Resposta:
 *   { items: Array<{ id, slug, name, body }> }
 *
 * Query:
 *   ?q=string  · filtra slug OR name por substring case-insensitive
 *   ?limit=N   · default 50, max 100
 *
 * Hook faz cache local depois e filtra client-side por keystroke pra evitar
 * roundtrip a cada tecla (autocomplete fluido).
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  try {
    const { ctx, repos } = await loadServerReposContext()

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()
    const limitRaw = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10)
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT),
    )

    const all = await repos.templates.listActive(ctx.clinic_id)

    const filtered = q
      ? all.filter((t) => {
          const slug = (t.slug ?? '').toLowerCase()
          const name = (t.name ?? '').toLowerCase()
          return slug.includes(q) || name.includes(q)
        })
      : all

    const items = filtered.slice(0, limit).map((t) => ({
      id: t.id,
      slug: t.slug ?? '',
      name: t.name,
      body: t.content ?? t.message ?? '',
    }))

    return NextResponse.json({ items })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error('[API] Templates quick error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
