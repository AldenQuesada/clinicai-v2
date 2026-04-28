/**
 * POST /api/flipbooks/[id]/password/verify
 *
 * Reader-side · valida senha contra `access_password_hash` (bcrypt) e seta
 * cookie `flipbook-pwd:{slug}` httpOnly contendo o hash da senha (1 dia TTL).
 *
 * Próximas requests do server lêem o cookie e checam staleness via
 * `validateFlipbookPasswordCookie` (lib helper).
 *
 * Não exigimos auth aqui (qualquer leitor anon pode tentar a senha).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { createServiceRoleClient } from '@clinicai/supabase/server'

const BodySchema = z.object({
  password: z.string().min(1).max(256),
  slug: z.string().min(1).max(200),
})

interface Params {
  params: Promise<{ id: string }>
}

const COOKIE_TTL_SECONDS = 60 * 60 * 24 // 1 dia

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
  }

  // Service role pra bypass de RLS (precisamos ler hash mesmo anon).
  // Endpoint só compara · nunca expõe hash no body.
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('flipbooks')
    .select('id, slug, access_password_hash')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'db' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!data.access_password_hash) {
    // Livro não é privado · responde ok (idempotente)
    return NextResponse.json({ ok: true, protected: false })
  }

  const ok = await bcrypt.compare(parsed.data.password, data.access_password_hash)
  if (!ok) return NextResponse.json({ error: 'wrong_password' }, { status: 401 })

  // Cookie value = hash (NÃO a senha · evita PII em cookie); se hash mudar, cookie invalida
  const res = NextResponse.json({ ok: true, protected: true })
  res.cookies.set({
    name: `flipbook-pwd:${data.slug}`,
    value: data.access_password_hash,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_TTL_SECONDS,
  })
  return res
}
