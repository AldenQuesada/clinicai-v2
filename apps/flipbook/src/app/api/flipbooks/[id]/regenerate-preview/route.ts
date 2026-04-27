import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

interface Params { params: Promise<{ id: string }> }

const PAGES_TO_RENDER = 5
const TARGET_WIDTH = 480

/**
 * POST /api/flipbooks/[id]/regenerate-preview
 *
 * Server-side: pre-renderiza primeiras N páginas (5) do PDF como JPEG
 * pra mini flipbook interativo no hero da home (sem expor PDF inteiro).
 *
 * Sobe em flipbook-previews/{slug}/page-1.jpg ... page-5.jpg
 * Atualiza preview_count na tabela.
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

    const { data: pdfBlob, error: dlErr } = await supabase.storage
      .from('flipbook-pdfs').download(book.pdf_url)
    if (dlErr || !pdfBlob) return NextResponse.json({ error: 'download failed' }, { status: 500 })

    const arrayBuffer = await pdfBlob.arrayBuffer()

    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist')
    const { createCanvas } = await import('canvas') as typeof import('canvas')

    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    }).promise

    const totalPages = pdf.numPages
    const pagesToRender = Math.min(PAGES_TO_RENDER, totalPages)

    const uploadedCount: number[] = []

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      const scale = TARGET_WIDTH / viewport.width
      const scaledViewport = page.getViewport({ scale })

      const canvas = createCanvas(scaledViewport.width, scaledViewport.height)
      const ctx = canvas.getContext('2d')

      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport: scaledViewport,
      }).promise

      const jpeg = canvas.toBuffer('image/jpeg', { quality: 0.82 })
      const path = `${book.slug}/page-${i}.jpg`

      const { error: upErr } = await supabase.storage.from('flipbook-previews')
        .upload(path, jpeg, { contentType: 'image/jpeg', upsert: true, cacheControl: '86400' })

      if (upErr) {
        console.warn(`upload page-${i} falhou:`, upErr.message)
      } else {
        uploadedCount.push(i)
      }
    }

    await supabase.from('flipbooks').update({
      preview_count: uploadedCount.length,
      page_count: book.page_count ?? totalPages,
    }).eq('id', id)

    return NextResponse.json({ ok: true, preview_count: uploadedCount.length, total_pages: totalPages })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
