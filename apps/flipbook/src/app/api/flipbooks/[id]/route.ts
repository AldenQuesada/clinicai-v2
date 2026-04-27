import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const PatchSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  subtitle: z.string().max(512).nullable().optional(),
  language: z.enum(['pt', 'en', 'es']).optional(),
  edition: z.string().max(64).nullable().optional(),
  amazon_asin: z.string().max(20).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

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

interface Params {
  params: Promise<{ id: string }>
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
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })

  // Auto-set published_at quando muda pra published
  const update: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.status === 'published') update.published_at = new Date().toISOString()

  const { data, error } = await auth.supabase.from('flipbooks').update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  // Pega paths antes de deletar (pra limpar storage)
  const { data: book, error: fetchErr } = await auth.supabase
    .from('flipbooks')
    .select('pdf_url, slug')
    .eq('id', id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Cascade do FK cuida de views + interactions
  const { error: delErr } = await auth.supabase.from('flipbooks').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Limpa storage (best-effort · não bloqueia se falhar)
  try {
    await auth.supabase.storage.from('flipbook-pdfs').remove([book.pdf_url])
    await auth.supabase.storage.from('flipbook-covers').remove([`${book.slug}/cover.jpg`])
  } catch {
    // ignore · arquivos órfãos podem ser limpos depois via cron
  }

  return NextResponse.json({ ok: true })
}
