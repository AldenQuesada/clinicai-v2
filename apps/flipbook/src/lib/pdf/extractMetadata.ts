'use client'

import { setupPdfWorker } from './worker'

/**
 * Extrai page_count + capa (1ª página como PNG) de um PDF antes do upload.
 * Roda no client (browser) usando pdfjs-dist via react-pdf.
 *
 * Limite: PDF até ~50MB sem travar o browser. Acima disso, refatorar pra
 * worker dedicado ou processar server-side.
 */
export interface PdfMetadata {
  pageCount: number
  coverBlob: Blob | null
}

export async function extractPdfMetadata(file: File, opts: { coverWidth?: number } = {}): Promise<PdfMetadata> {
  setupPdfWorker()

  // Import dinâmico pra não inflar bundle inicial
  const pdfjs = await import('pdfjs-dist')

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages

  let coverBlob: Blob | null = null
  try {
    const page = await pdf.getPage(1)
    const targetWidth = opts.coverWidth ?? 600
    const viewport = page.getViewport({ scale: 1 })
    const scale = targetWidth / viewport.width
    const scaledViewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise
      coverBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
      )
    }
  } catch {
    // capa best-effort; se falhar, segue sem
    coverBlob = null
  }

  return { pageCount, coverBlob }
}
