/**
 * PATCH /api/flipbooks/[id]/settings
 *
 * Merge raso de chaves no `flipbooks.settings` jsonb. Usado por todos os
 * painéis do editor (controls, pagination, background, logo, bg-audio,
 * toc, lead-capture, etc).
 *
 * Body: { patch: Record<string, unknown> }
 *   → settings = { ...current, ...patch }
 *
 * Owner-only via FLIPBOOK_ADMIN_EMAILS allowlist + Supabase RLS.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const PatchSchema = z.object({
  // Cada chave de top-level pode ser qualquer objeto/string/null. Validação
  // semântica acontece em camadas downstream (cada painel sabe seu shape).
  patch: z.record(z.unknown()),
})

interface Params {
  params: Promise<{ id: string }>
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }

  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
    return { ok: false as const, status: 403 }
  }
  return { ok: true as const, supabase, user }
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
  }

  // Limite defensivo · evita patch monstro acidental
  if (Object.keys(parsed.data.patch).length > 32) {
    return NextResponse.json({ error: 'patch too large (max 32 keys)' }, { status: 400 })
  }

  // Lê settings atuais, faz merge raso, persiste
  const { data: current, error: getErr } = await auth.supabase
    .from('flipbooks')
    .select('settings')
    .eq('id', id)
    .maybeSingle()

  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const merged = {
    ...((current.settings as Record<string, unknown>) ?? {}),
    ...parsed.data.patch,
  }

  const { data, error } = await auth.supabase
    .from('flipbooks')
    .update({ settings: merged })
    .eq('id', id)
    .select('settings')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: data.settings })
}
