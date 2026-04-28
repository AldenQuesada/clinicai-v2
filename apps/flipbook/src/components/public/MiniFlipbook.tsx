'use client'

import { useEffect, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Play, ArrowRight, ChevronLeft, ChevronRight,
  Maximize2, Minimize2, Volume2, VolumeX, Download,
} from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { useReadingSound } from '@/lib/utils/useReadingSound'

interface Props {
  book: Flipbook
  previewBaseUrl?: string
}

interface FlipApi {
  pageFlip: () => {
    flipNext: () => void
    flipPrev: () => void
    turnToPage: (n: number) => void
  }
}

/**
 * Mini flipbook · estado fechado: largura de UMA capa.
 * Click → wrapper expande pra esquerda revelando double-spread interno.
 * Borda direita ancorada (livro "se desloca pra esquerda" ao abrir).
 *
 * NOTA: bug conhecido — capa fica visível do lado esquerdo do 1º spread aberto
 * (efeito do showCover do react-pageflip). Será resolvido depois.
 */
export function MiniFlipbook({ book, previewBaseUrl }: Props) {
  const [size, setSize] = useState({ width: 380, height: 532 })
  const [currentPage, setCurrentPage] = useState(0)
  const [isFlipping, setIsFlipping] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<FlipApi | null>(null)
  const sound = useReadingSound()

  const supabaseUrl = previewBaseUrl
    ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/flipbook-previews`

  // Aberto: passou da capa OU está virando agora (pra wrapper expandir junto com a animação)
  const isOpen = currentPage > 0 || isFlipping

  useEffect(() => {
    if (!wrapRef.current) return
    const wrap = wrapRef.current

    const update = () => {
      const rect = wrap.getBoundingClientRect()
      const isFs = !!document.fullscreenElement
      const availableW = Math.max(280, rect.width - (isFs ? 64 : 32))
      const availableH = isFs
        ? window.innerHeight - 100
        : Math.min(window.innerHeight - 200, 900)

      const ratio = 1.4
      const isMobile = window.innerWidth < 768

      let pageW: number
      let pageH: number

      if (isMobile) {
        pageW = Math.min(availableW, 480)
        pageH = pageW * ratio
        if (pageH > availableH) { pageH = availableH; pageW = pageH / ratio }
      } else {
        pageH = Math.min(availableH, 1080)
        pageW = pageH / ratio
        const totalW = pageW * 2
        if (totalW > availableW) {
          pageW = availableW / 2
          pageH = pageW * ratio
          if (pageH > availableH) { pageH = availableH; pageW = pageH / ratio }
        }
        if (pageW > 480) { pageW = 480; pageH = pageW * ratio }
      }

      setSize({ width: Math.floor(pageW), height: Math.floor(pageH) })
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    window.addEventListener('resize', update)
    document.addEventListener('fullscreenchange', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
      document.removeEventListener('fullscreenchange', update)
    }
  }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const previewCount = book.preview_count ?? 0
  const pages = Array.from({ length: previewCount }, (_, i) => i + 1)
  // Slides: [capa] + [N páginas] + [CTA] · capa e CTA são single-page por showCover
  const totalSlides = 1 + previewCount + 1

  const onFlip = (e: { data: number }) => {
    setCurrentPage(e.data)
    setIsFlipping(false)
    sound.play()
  }

  const onChangeState = (e: { data: string }) => {
    // 'user_fold' | 'fold_corner' | 'flipping' | 'read'
    if (e.data === 'flipping' || e.data === 'user_fold') {
      setIsFlipping(true)
    } else if (e.data === 'read') {
      setIsFlipping(false)
    }
  }

  const flipNext = () => {
    const api = flipRef.current
    if (!api) return
    try { api.pageFlip().flipNext() } catch {}
  }
  const flipPrev = () => {
    const api = flipRef.current
    if (!api) return
    try { api.pageFlip().flipPrev() } catch {}
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.()
    }
  }

  const downloadDemo = () => {
    if (previewCount === 0) return
    const url = `${supabaseUrl}/${book.slug}/page-1.jpg`
    const a = document.createElement('a')
    a.href = url
    a.download = `${book.slug}-demo.jpg`
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const wrapperWidth = isOpen ? size.width * 2 : size.width

  return (
    <motion.div
      ref={wrapRef}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="relative w-full"
    >
      <div
        className="absolute -inset-12 opacity-50 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(232,177,74,0.32), transparent 60%)' }}
      />

      {/* Container · justify-end ancora a borda direita do livro */}
      <div
        ref={containerRef}
        className={`relative flex items-center justify-end w-full ${isFullscreen ? 'bg-bg min-h-screen' : ''}`}
        style={{ height: size.height + 60 }}
      >
        {/* Wrapper · width animado · borda direita ancorada */}
        <motion.div
          className="relative"
          style={{ height: size.height }}
          animate={{ width: wrapperWidth }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {/* 3 controles top-right */}
          <div className="absolute -top-12 right-0 z-30 flex items-center gap-1.5">
            <CtrlBtn
              icon={isFullscreen ? Minimize2 : Maximize2}
              title={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
              onClick={toggleFullscreen}
            />
            <CtrlBtn
              icon={sound.enabled ? Volume2 : VolumeX}
              title={sound.enabled ? 'Mutar som' : 'Ativar som'}
              onClick={sound.toggle}
            />
            <CtrlBtn icon={Download} title="Baixar demo (1ª página)" onClick={downloadDemo} />
          </div>

          {/* Janela · overflow hidden corta o lado esquerdo enquanto fechado */}
          <div
            className="absolute top-0 right-0 overflow-hidden"
            style={{ width: '100%', height: size.height }}
          >
            {/* Flipbook · ancorado à direita · sempre 2*pageW interno */}
            <div
              className="absolute top-0"
              style={{ right: 0, width: size.width * 2, height: size.height }}
            >
              <HTMLFlipBook
                ref={flipRef as unknown as React.Ref<HTMLDivElement>}
                width={size.width}
                height={size.height}
                size="fixed"
                minWidth={200}
                maxWidth={800}
                minHeight={280}
                maxHeight={1120}
                drawShadow
                flippingTime={650}
                usePortrait={false}
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
                onChangeState={onChangeState}
                className="mini-flipbook"
                style={{}}
              >
                {/* CAPA · slide 0 · single-page por showCover */}
                <div key="cover" className="bg-bg-elevated overflow-hidden relative">
                  {book.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={book.cover_url}
                      alt={`Capa de ${book.title}`}
                      className="w-full h-full object-cover"
                      loading="eager"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: '#0E2A47' }}>
                      <div className="text-center px-6">
                        <div className="font-display italic text-gold text-4xl mb-2">
                          {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
                        </div>
                        <div className="font-meta text-[10px]" style={{ color: '#F5F1EA' }}>{book.author}</div>
                      </div>
                    </div>
                  )}
                </div>

                {pages.map((n) => (
                  <div key={`p${n}`} className="bg-bg-elevated overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${supabaseUrl}/${book.slug}/page-${n}.jpg`}
                      alt={`Página ${n} de ${book.title}`}
                      className="w-full h-full object-cover"
                      loading={n <= 2 ? 'eager' : 'lazy'}
                      draggable={false}
                    />
                  </div>
                ))}

                {/* CTA final */}
                <div className="bg-bg-elevated overflow-hidden flex flex-col items-center justify-center text-center p-6 relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-gold/10 via-transparent to-transparent" />
                  <Play className="w-10 h-10 text-gold mb-4 relative" fill="currentColor" />
                  <div className="font-display italic text-text text-2xl md:text-3xl mb-2 leading-tight relative">
                    Continue<br/>lendo
                  </div>
                  <div className="font-meta text-text-muted text-[10px] mb-6 relative">
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
            </div>
          </div>

          {/* Setas · prev só aparece quando aberto */}
          {isOpen && (
            <button
              onClick={flipPrev}
              aria-label="Página anterior"
              disabled={currentPage === 0}
              className="absolute left-0 top-1/2 -translate-y-1/2 -ml-5 lg:-ml-12 w-10 h-10 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl disabled:opacity-30 disabled:cursor-not-allowed z-20"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={flipNext}
            aria-label="Próxima página"
            disabled={currentPage >= totalSlides - 1}
            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-5 lg:-mr-12 w-10 h-10 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl disabled:opacity-30 disabled:cursor-not-allowed z-20"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </motion.div>
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
  icon: Icon, title, onClick, disabled,
}: { icon: typeof Maximize2; title: string; onClick?: () => void; disabled?: boolean }) {
  const cls = `w-9 h-9 rounded-full bg-bg-elevated border border-border-strong flex items-center justify-center transition shadow-lg ${
    disabled
      ? 'text-text-dim cursor-not-allowed opacity-60'
      : 'text-text-muted hover:text-gold hover:border-gold'
  }`
  return (
    <button onClick={onClick} title={title} aria-label={title} disabled={disabled} className={cls}>
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )
}
