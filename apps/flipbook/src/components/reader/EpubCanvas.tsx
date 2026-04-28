'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ePub, { type Book, type Rendition } from 'epubjs'

interface Props {
  pdfUrl: string  // signed URL · serve EPUB também
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

export interface EpubMatch {
  cfi: string
  excerpt: string
  spineLabel: string
}

/**
 * Handle exposto via ref. `pageFlip` é o subset usado pelo Reader (igual ao
 * CanvasHandle do PDF). `search` e `displayCfi` são extensões EPUB-only —
 * opcionais no tipo pra Reader.tsx continuar usando CanvasHandle genérico,
 * mas sempre presentes em runtime nesta implementação. EpubSearchPanel faz
 * cast/check pra invocar essas extensões.
 */
export interface EpubHandle {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage?: (n: number) => void }
  search?: (query: string, opts?: { maxResults?: number }) => Promise<EpubMatch[]>
  displayCfi?: (cfi: string) => Promise<void> | void
}

/**
 * Reader EPUB usando epub.js. Renderiza nativamente com paging.
 * UX é ligeiramente diferente do PDF flip-book mas mais confortável pra ePub
 * (texto reflowable).
 */
export const EpubCanvas = forwardRef<EpubHandle, Props>(function EpubCanvas(
  { pdfUrl, onPageChange, onTotalPages },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<Book | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const [error, setError] = useState<string | null>(null)

  useImperativeHandle(ref, () => ({
    pageFlip: () => ({
      flipNext: () => renditionRef.current?.next(),
      flipPrev: () => renditionRef.current?.prev(),
    }),
    search: async (query, opts) => {
      const book = bookRef.current
      if (!book || !query.trim()) return []
      const max = opts?.maxResults ?? 30
      const results: EpubMatch[] = []
      // Itera spine items · cada um pode ter matches independentes
      const spineItems = (book.spine as unknown as { each: (cb: (item: { href: string; load: (req: unknown) => Promise<unknown>; find: (q: string) => Array<{ cfi: string; excerpt: string }>; unload: () => void }) => void) => void }).each
      const found: EpubMatch[] = []
      const spineCalls: Promise<void>[] = []
      spineItems.call(book.spine, (item) => {
        spineCalls.push((async () => {
          try {
            await item.load(book.load.bind(book))
            const matches = item.find(query) ?? []
            for (const m of matches) {
              found.push({ cfi: m.cfi, excerpt: m.excerpt, spineLabel: item.href })
              if (found.length >= max) break
            }
            try { item.unload() } catch {}
          } catch {
            // item indisponível · ignora
          }
        })())
      })
      await Promise.all(spineCalls)
      results.push(...found.slice(0, max))
      return results
    },
    displayCfi: (cfi) => {
      return renditionRef.current?.display(cfi)
    },
  }))

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      try {
        const book = ePub(pdfUrl)
        bookRef.current = book

        const rendition = book.renderTo(containerRef.current!, {
          width: '100%',
          height: '100%',
          spread: 'auto',
          flow: 'paginated',
          allowScriptedContent: false,
        })
        renditionRef.current = rendition

        // Tema dark luxury matching brand
        rendition.themes.register('luxury', {
          body: {
            background: '#0F0D0A',
            color: '#F5F0E8',
            'font-family': 'Georgia, serif',
            'line-height': '1.7',
            padding: '0 1em',
          },
          a: { color: '#C9A96E' },
          'h1, h2, h3, h4': { color: '#DFC5A0', 'font-family': 'Georgia, serif' },
          'p, li': { color: '#F5F0E8' },
          'img': { 'max-width': '100% !important' },
        })
        rendition.themes.select('luxury')

        await rendition.display()
        if (cancelled) return

        await book.locations.generate(1024)
        if (cancelled) return

        const total = book.locations.length() || 0
        onTotalPages(total)

        rendition.on('relocated', (location: { start: { displayed: { page: number } } }) => {
          onPageChange(location.start.displayed.page ?? 1)
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao abrir EPUB'
        setError(msg)
      }
    }
    init()

    return () => {
      cancelled = true
      try { renditionRef.current?.destroy() } catch {}
      try { bookRef.current?.destroy() } catch {}
    }
  }, [pdfUrl, onPageChange, onTotalPages])

  if (error) {
    return (
      <div className="text-red-400 text-center p-8 font-display italic text-xl">
        {error}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full max-w-5xl mx-auto bg-bg-elevated rounded shadow-[var(--shadow-page)]"
      style={{ minHeight: '60vh' }}
    />
  )
})
