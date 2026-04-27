'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { ReaderSkeleton } from '@/components/ui/Skeleton'

interface Props {
  pdfUrl: string
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

export interface HtmlHandle {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void }
}

/**
 * Reader HTML simples · scroll vertical paginado por viewport-height chunks.
 * DOMPurify sanitiza · script tags removidas.
 */
export const HtmlCanvas = forwardRef<HtmlHandle, Props>(function HtmlCanvas(
  { pdfUrl, onPageChange, onTotalPages },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState(1)

  useImperativeHandle(ref, () => ({
    pageFlip: () => ({
      flipNext: () => {
        const el = scrollRef.current
        if (el) el.scrollBy({ top: el.clientHeight * 0.9, behavior: 'smooth' })
      },
      flipPrev: () => {
        const el = scrollRef.current
        if (el) el.scrollBy({ top: -el.clientHeight * 0.9, behavior: 'smooth' })
      },
    }),
  }))

  useEffect(() => {
    let cancelled = false
    fetch(pdfUrl)
      .then((r) => r.text())
      .then((raw) => {
        if (cancelled) return
        const clean = DOMPurify.sanitize(raw, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
        })
        setHtml(clean)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao abrir HTML')
      })
    return () => { cancelled = true }
  }, [pdfUrl])

  useEffect(() => {
    if (!scrollRef.current || !html) return
    const el = scrollRef.current
    const total = Math.max(1, Math.ceil(el.scrollHeight / el.clientHeight))
    setPages(total)
    onTotalPages(total)

    const onScroll = () => {
      const current = Math.min(total, Math.floor(el.scrollTop / el.clientHeight) + 1)
      onPageChange(current)
    }
    el.addEventListener('scroll', onScroll)
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [html, onPageChange, onTotalPages])

  if (error) return <div className="text-red-400 text-center p-8 font-display italic text-xl">{error}</div>
  if (!html) return <ReaderSkeleton />

  return (
    <div
      ref={scrollRef}
      className="w-full h-full max-w-3xl mx-auto bg-bg-elevated rounded shadow-[var(--shadow-page)] overflow-y-auto px-8 py-10 prose prose-invert"
      style={{ scrollSnapType: 'y mandatory' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
