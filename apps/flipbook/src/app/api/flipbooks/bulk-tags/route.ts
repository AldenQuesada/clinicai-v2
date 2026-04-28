import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const BulkTagsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  /**
   * - `add`: une os tags informados às tags existentes (sem duplicar)
   * - `remove`: tira os tags informados das existentes
   * - `set`: sobrescreve completamente
   */
  mode: z.enum(['add', 'remove', 'set']),
  tags: z.array(z.string().min(1).max(48)).max(32),
})

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const, supabase, user }
}

/**
 * POST /api/flipbooks/bulk-tags
 * Add/remove/set tags em múltiplos flipbooks de uma só vez.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = BulkTagsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })

  const { ids, mode, tags } = parsed.data
  const newTags = Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)))

  if (mode === 'set') {
    const { error } = await auth.supabase.from('flipbooks').update({ tags: newTags }).in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: ids.length })
  }

  // add/remove · precisa fetch + merge porque postgres array ops via REST não dão
  const { data: rows, error: fetchErr } = await auth.supabase
    .from('flipbooks').select('id, tags').in('id', ids)
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  const updates = (rows ?? []).map((row: { id: string; tags: string[] | null }) => {
    const existing = new Set((row.tags ?? []).map((t) => t.toLowerCase()))
    if (mode === 'add') {
      for (const t of newTags) existing.add(t)
    } else {
      for (const t of newTags) existing.delete(t)
    }
    return { id: row.id, tags: Array.from(existing) }
  })

  // Updates em paralelo · Supabase REST não tem batch update por row
  const results = await Promise.all(
    updates.map((u) =>
      auth.supabase.from('flipbooks').update({ tags: u.tags }).eq('id', u.id),
    ),
  )
  const failed = results.filter((r) => r.error).length
  if (failed > 0) return NextResponse.json({ error: `${failed} updates falharam`, ok: false }, { status: 500 })

  return NextResponse.json({ ok: true, updated: updates.length })
}
