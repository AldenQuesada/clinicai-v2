/**
 * POST   /api/flipbooks/[id]/password · seta nova senha (hash bcrypt)
 * DELETE /api/flipbooks/[id]/password · remove proteção
 * GET    /api/flipbooks/[id]/password · retorna { protected: bool } (sem hash)
 *
 * Nunca expõe o hash · só metadata. Owner-only via FLIPBOOK_ADMIN_EMAILS.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createServerClient } from '@/lib/supabase/server'

const BodySchema = z.object({
  password: z.string().min(4, 'mínimo 4 caracteres').max(256),
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

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { data, error } = await auth.supabase
    .from('flipbooks')
    .select('access_password_hash')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ protected: !!data.access_password_hash })
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
  }

  // bcryptjs · cost 10 = ~80ms em Node, equilibra brute-force resistance vs UX
  const hash = await bcrypt.hash(parsed.data.password, 10)

  const { error } = await auth.supabase
    .from('flipbooks')
    .update({ access_password_hash: hash })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, protected: true })
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { error } = await auth.supabase
    .from('flipbooks')
    .update({ access_password_hash: null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, protected: false })
}
