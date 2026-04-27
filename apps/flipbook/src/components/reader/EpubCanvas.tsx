'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import ePub, { type Book, type Rendition } from 'epubjs'

interface Props {
  pdfUrl: string  // signed URL · serve EPUB também
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

export interface EpubHandle {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void }
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
