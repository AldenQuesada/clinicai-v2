'use client'

import { useEffect, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Play, ArrowRight, ChevronLeft, ChevronRight,
  Maximize2, Settings, ArrowLeftRight, MousePointer2, PenLine,
} from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'

interface Props {
  book: Flipbook
  previewBaseUrl?: string
}

/**
 * Mini flipbook interativo · usa primeiras N páginas pré-renderizadas em JPEG.
 * Tamanho responsivo · ocupa todo o espaço do hero (não mais 380px fixo).
 *
 * Controles no canvas (modelo Heyzine):
 *   top-right · Fullscreen + Direction + Settings
 *   bottom-right · Annotate (placeholder)
 *   bottom-left · Cursor select (placeholder)
 *
 * Última slide = CTA "Continue lendo".
 */
export function MiniFlipbook({ book, previewBaseUrl }: Props) {
  const [size, setSize] = useState({ width: 480, height: 672 })
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
      // Single page (portrait) · ocupa todo o espaço disponível com aspect 0.71 (1/1.4)
      const availableW = Math.max(280, rect.width - 32)
      const availableH = Math.max(360, Math.min(rect.height - 80, window.innerHeight - 200))

      const ratio = 1.4
      let w = availableW
      let h = w * ratio
      if (h > availableH) { h = availableH; w = h / ratio }

      // Cap em 720px de largura · tela muito grande não estica demais
      if (w > 720) { w = 720; h = w * ratio }

      setSize({ width: Math.floor(w), height: Math.floor(h) })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [])

  const previewCount = book.preview_count ?? 0
  const pages = Array.from({ length: previewCount }, (_, i) => i + 1)
  const totalSlides = previewCount + 1

  const onFlip = (e: { data: number }) => setCurrentPage(e.data)
  const flipNext = () => flipRef.current?.pageFlip()?.flipNext()
  const flipPrev = () => flipRef.current?.pageFlip()?.flipPrev()

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="relative w-full min-h-[460px] md:min-h-[600px] lg:min-h-[720px]"
    >
      {/* Glow ambient */}
      <div
        className="absolute -inset-12 opacity-50 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(232,177,74,0.32), transparent 60%)' }}
      />

      {/* Container do flipbook · centralizado */}
      <div className="relative flex items-center justify-center w-full h-full min-h-[inherit]">
        <div className="relative" style={{ width: size.width, height: size.height }}>
          {/* 3 controles top-right (Heyzine style) */}
          <div className="absolute -top-12 right-0 z-10 flex items-center gap-1.5">
            <CtrlBtn icon={Maximize2} title="Abrir leitor completo" href={`/${book.slug}`} />
            <CtrlBtn icon={ArrowLeftRight} title="Direção do flip" />
            <CtrlBtn icon={Settings} title="Configurações" />
          </div>

          <HTMLFlipBook
            ref={flipRef as React.Ref<typeof HTMLFlipBook>}
            width={size.width}
            height={size.height}
            size="fixed"
            minWidth={200}
            maxWidth={800}
            minHeight={280}
            maxHeight={1120}
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

            {/* Última slide = CTA */}
            <div className="bg-bg-elevated rounded overflow-hidden flex flex-col items-center justify-center text-center p-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
              <Play className="w-12 h-12 text-gold mb-5 relative" fill="currentColor" />
              <div className="font-display italic text-text text-3xl md:text-4xl mb-3 leading-tight relative">
                Continue<br/>lendo
              </div>
              <div className="font-meta text-text-muted text-[10px] mb-8 relative">
                {book.page_count ? `${book.page_count} páginas no total` : 'livro completo'}
              </div>
              <Link
                href={`/${book.slug}`}
                className="font-meta bg-gold text-bg px-5 py-3 rounded hover:bg-gold-light transition flex items-center gap-2 text-xs relative"
              >
                Abrir leitor <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </HTMLFlipBook>

          {/* Controles bottom · cursor (left) + pen (right) */}
          <div className="absolute -bottom-12 left-0 z-10">
            <CtrlBtn icon={MousePointer2} title="Selecionar (em breve)" disabled />
          </div>
          <div className="absolute -bottom-12 right-0 z-10">
            <CtrlBtn icon={PenLine} title="Anotar (em breve)" disabled />
          </div>

          {/* Setas prev/next laterais · sutis · só aparecem se faz sentido */}
          {currentPage > 0 && (
            <button
              onClick={flipPrev}
              aria-label="Página anterior"
              className="absolute left-0 top-1/2 -translate-y-1/2 -ml-5 lg:-ml-8 w-10 h-10 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {currentPage < totalSlides - 1 && (
            <button
              onClick={flipNext}
              aria-label="Próxima página"
              className="absolute right-0 top-1/2 -translate-y-1/2 -mr-5 lg:-mr-8 w-10 h-10 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>
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
    </motion.div>
  )
}

function CtrlBtn({
  icon: Icon, title, href, disabled,
}: { icon: typeof Maximize2; title: string; href?: string; disabled?: boolean }) {
  const cls = `w-9 h-9 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center transition shadow-lg ${
    disabled
      ? 'text-text-dim cursor-not-allowed opacity-60'
      : 'text-text-muted hover:text-gold hover:border-gold'
  }`
  if (href && !disabled) {
    return (
      <Link href={href} title={title} aria-label={title} className={cls}>
        <Icon className="w-4 h-4" strokeWidth={1.5} />
      </Link>
    )
  }
  return (
    <button title={title} aria-label={title} disabled={disabled} className={cls}>
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )
}
