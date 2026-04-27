import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/flipbooks/[id]/regenerate-cover
 *
 * Server-side: baixa o PDF do storage, renderiza a 1ª página em canvas via
 * pdfjs-dist, gera JPEG, sobe em flipbook-covers, atualiza cover_url + page_count.
 *
 * Util pra livros subidos antes do P0.1 (que faziam isso no client).
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
      .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }

    const { data: book, error: getErr } = await supabase
      .from('flipbooks').select('*').eq('id', id).single()
    if (getErr || !book) return NextResponse.json({ error: 'not found' }, { status: 404 })

    if (book.format !== 'pdf') {
      return NextResponse.json({ error: 'apenas PDF suportado por enquanto' }, { status: 400 })
    }

    // Baixa o PDF
    const { data: pdfBlob, error: dlErr } = await supabase.storage
      .from('flipbook-pdfs').download(book.pdf_url)
    if (dlErr || !pdfBlob) return NextResponse.json({ error: 'download failed' }, { status: 500 })

    const arrayBuffer = await pdfBlob.arrayBuffer()

    // pdfjs-dist + canvas (legacy build pra Node)
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist')
    const { createCanvas } = await import('canvas') as typeof import('canvas')

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer), useSystemFonts: true }).promise
    const pageCount = pdf.numPages

    const page = await pdf.getPage(1)
    const targetW = 600
    const viewport = page.getViewport({ scale: 1 })
    const scale = targetW / viewport.width
    const scaledViewport = page.getViewport({ scale })

    const canvas = createCanvas(scaledViewport.width, scaledViewport.height)
    const ctx = canvas.getContext('2d')

    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport: scaledViewport,
    }).promise

    const jpegBuf = canvas.toBuffer('image/jpeg', { quality: 0.85 })

    // Upload da capa
    const coverPath = `${book.slug}/cover.jpg`
    const { error: upErr } = await supabase.storage.from('flipbook-covers')
      .upload(coverPath, jpegBuf, { contentType: 'image/jpeg', upsert: true, cacheControl: '86400' })
    if (upErr) return NextResponse.json({ error: 'upload cover failed: ' + upErr.message }, { status: 500 })

    const { data: pubData } = supabase.storage.from('flipbook-covers').getPublicUrl(coverPath)

    // Atualiza DB
    const { error: updErr } = await supabase.from('flipbooks').update({
      cover_url: pubData.publicUrl,
      page_count: pageCount,
    }).eq('id', id)
    if (updErr) return NextResponse.json({ error: 'db update failed: ' + updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, cover_url: pubData.publicUrl, page_count: pageCount })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    const stack = e instanceof Error ? e.stack : undefined
    console.error('[regenerate-cover] FAIL:', msg, stack)
    return NextResponse.json({ error: msg, stack: process.env.NODE_ENV !== 'production' ? stack : undefined }, { status: 500 })
  }
}
