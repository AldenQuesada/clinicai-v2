import { NextResponse } from 'next/server'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { createServerClient } from '@/lib/supabase/server'

interface Params {
  params: Promise<{ id: string }>
}

/**
 * POST /api/flipbooks/[id]/duplicate
 * Duplica um livro: copia metadata, gera novo slug, copia o PDF no bucket
 * (mesmo path mas novo slug-prefix). Status = 'draft'.
 */
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { data: orig, error: getErr } = await supabase.from('flipbooks').select('*').eq('id', id).single()
  if (getErr || !orig) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const newSlug = `${orig.slug}-copy-${Date.now().toString(36)}`
  const ext = orig.pdf_url.split('.').pop() ?? 'pdf'
  const newPdfPath = `${newSlug}/${uuidv4()}.${ext}`

  // Copia o PDF no storage
  const { error: copyErr } = await supabase.storage.from('flipbook-pdfs').copy(orig.pdf_url, newPdfPath)
  if (copyErr) return NextResponse.json({ error: 'copy failed: ' + copyErr.message }, { status: 500 })

  // Copia capa (best-effort)
  let coverUrl: string | null = null
  try {
    await supabase.storage.from('flipbook-covers').copy(`${orig.slug}/cover.jpg`, `${newSlug}/cover.jpg`)
    const { data } = supabase.storage.from('flipbook-covers').getPublicUrl(`${newSlug}/cover.jpg`)
    coverUrl = data.publicUrl
  } catch {
    coverUrl = orig.cover_url
  }

  const { data: created, error: insErr } = await supabase
    .from('flipbooks')
    .insert({
      slug: newSlug,
      title: `${orig.title} (cópia)`,
      subtitle: orig.subtitle,
      author: orig.author,
      language: orig.language,
      edition: orig.edition,
      cover_url: coverUrl,
      pdf_url: newPdfPath,
      format: orig.format,
      page_count: orig.page_count,
      amazon_asin: orig.amazon_asin,
      status: 'draft',
      metadata: orig.metadata,
    })
    .select('*')
    .single()

  if (insErr) {
    // Cleanup do PDF copiado se insert falhou
    await supabase.storage.from('flipbook-pdfs').remove([newPdfPath]).catch(() => {})
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json(created)
}
