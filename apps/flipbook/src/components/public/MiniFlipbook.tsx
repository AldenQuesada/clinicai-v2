'use client'

import { useEffect, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import Link from 'next/link'
import { Play, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Flipbook } from '@/lib/supabase/flipbooks'

interface Props {
  book: Flipbook
  /**
   * Base URL do bucket public flipbook-previews (sem trailing slash).
   * Default: usa NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/public/flipbook-previews
   */
  previewBaseUrl?: string
}

/**
 * Mini flipbook interativo · usa só primeiras N páginas pré-renderizadas
 * em JPEG (sem react-pdf · sem expor PDF inteiro · super leve).
 *
 * Última página = CTA "Ler completo →" que leva pro leitor full.
 */
export function MiniFlipbook({ book, previewBaseUrl }: Props) {
  const [size, setSize] = useState({ width: 320, height: 448 })
  const [currentPage, setCurrentPage] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } } | null>(null)

  const supabaseUrl = previewBaseUrl
    ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/flipbook-previews`

  useEffect(() => {
    if (!wrapRef.current) return
    const wrap = wrapRef.current
    const update = () => {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(220, Math.min(rect.width - 24, 380))
      const h = w * 1.4
      setSize({ width: Math.floor(w), height: Math.floor(h) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const previewCount = book.preview_count ?? 0
  const pages = Array.from({ length: previewCount }, (_, i) => i + 1)
  const totalSlides = previewCount + 1 // +1 pra CTA final

  const onFlip = (e: { data: number }) => setCurrentPage(e.data)

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="relative w-full max-w-[440px] mx-auto"
    >
      {/* Glow ambient */}
      <div
        className="absolute -inset-12 opacity-50 blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(232,177,74,0.32), transparent 60%)',
        }}
      />

      <div className="relative">
        <HTMLFlipBook
          ref={flipRef as React.Ref<typeof HTMLFlipBook>}
          width={size.width}
          height={size.height}
          size="fixed"
          minWidth={200}
          maxWidth={500}
          minHeight={280}
          maxHeight={700}
          drawShadow
          flippingTime={650}
          usePortrait
          startZIndex={0}
          autoSize={false}
          maxShadowOpacity={0.5}
          showCover
          mobileScrollSupport={false}
          clickEventForward
          useMouseEvents
          swipeDistance={30}
          showPageCorners
          disableFlipByClick={false}
          startPage={0}
          onFlip={onFlip}
          className="mini-flipbook"
          style={{}}
        >
          {pages.map((n) => (
            <div key={`p${n}`} className="bg-bg-elevated rounded shadow-page overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${supabaseUrl}/${book.slug}/page-${n}.jpg`}
                alt={`Página ${n} de ${book.title}`}
                className="w-full h-full object-cover"
                loading={n <= 2 ? 'eager' : 'lazy'}
              />
            </div>
          ))}

          {/* Última "página" · CTA pra leitor completo */}
          <div className="bg-bg-elevated rounded overflow-hidden flex flex-col items-center justify-center text-center p-6 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
            <Play className="w-10 h-10 text-gold mb-4 relative" fill="currentColor" />
            <div className="font-display italic text-text text-2xl mb-2 leading-tight relative">Continue<br/>lendo</div>
            <div className="font-meta text-text-muted text-[9px] mb-6 relative">
              {book.page_count ? `${book.page_count} páginas no total` : 'livro completo'}
            </div>
            <Link
              href={`/${book.slug}`}
              className="font-meta bg-gold text-bg px-4 py-2.5 rounded hover:bg-gold-light transition flex items-center gap-2 text-xs relative"
            >
              Abrir leitor <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </HTMLFlipBook>

        {/* Botões prev/next sutis · só mostra se não está na primeira/última */}
        {currentPage > 0 && (
          <button
            onClick={() => flipRef.current?.pageFlip()?.flipPrev()}
            aria-label="Página anterior"
            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 lg:-ml-6 w-9 h-9 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {currentPage < totalSlides - 1 && (
          <button
            onClick={() => flipRef.current?.pageFlip()?.flipNext()}
            aria-label="Próxima página"
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 lg:-mr-6 w-9 h-9 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Page indicator */}
      <div className="mt-4 flex items-center justify-center gap-1.5">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i === currentPage ? 'w-8 bg-gold' : 'w-1.5 bg-border-strong'
            }`}
          />
        ))}
      </div>

      {/* Sub label */}
      <div className="mt-3 text-center font-meta text-text-dim text-[9px]">
        Preview · arraste pra virar a página
      </div>
    </motion.div>
  )
}
