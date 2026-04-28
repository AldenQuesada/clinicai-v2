'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Volume2, VolumeX, BookOpen, Link2, Check, ZoomIn, Sun, Moon, Coffee, Search, ListOrdered, ExternalLink, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { setupPdfWorker } from '@/lib/pdf/worker'
import { ReaderSkeleton } from '@/components/ui/Skeleton'
import { UnsupportedFormat } from '@/components/reader/UnsupportedFormat'
import { CinematicCover } from '@/components/reader/CinematicCover'
import { ResumeBanner } from '@/components/reader/ResumeBanner'
import { SearchPanel } from '@/components/reader/SearchPanel'
import { TocSidebar } from '@/components/reader/TocSidebar'
import { useReadingSound } from '@/lib/utils/useReadingSound'
import { useProgress } from '@/lib/utils/useProgress'

type Format = 'pdf' | 'epub' | 'mobi' | 'cbz' | 'html'

const FlipbookCanvas = dynamic(() => import('@/components/reader/FlipbookCanvas').then(m => m.FlipbookCanvas), {
  ssr: false, loading: () => <ReaderSkeleton />,
})
const EpubCanvas = dynamic(() => import('@/components/reader/EpubCanvas').then(m => m.EpubCanvas), {
  ssr: false, loading: () => <ReaderSkeleton />,
})
const CbzCanvas = dynamic(() => import('@/components/reader/CbzCanvas').then(m => m.CbzCanvas), {
  ssr: false, loading: () => <ReaderSkeleton />,
})
const HtmlCanvas = dynamic(() => import('@/components/reader/HtmlCanvas').then(m => m.HtmlCanvas), {
  ssr: false, loading: () => <ReaderSkeleton />,
})

interface Props {
  pdfUrl: string
  pdfPath: string
  flipbookId: string
  pageCount: number | null
  format: Format
  title: string
  subtitle: string | null
  author: string
  edition: string | null
  coverUrl: string | null
  slug: string
  initialPage: number
  amazonAsin: string | null
}

const REFRESH_INTERVAL_MS = 50 * 60 * 1000
const IDLE_HIDE_MS = 3000

interface CanvasHandle {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (idx: number) => void }
}

export function Reader({
  pdfUrl: initialUrl, pdfPath, flipbookId, pageCount, format,
  title, subtitle, author, edition, coverUrl, slug, initialPage, amazonAsin,
}: Props) {
  const [pdfUrl, setPdfUrl] = useState(initialUrl)
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(pageCount ?? 0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Skip cover se chegou via deep link (?p=N)
  const [coverShown, setCoverShown] = useState(initialPage === 1)
  const [cursorHidden, setCursorHidden] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showResumeBanner, setShowResumeBanner] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(0) // 0=100% · 1=125% · 2=150%
  const [theme, setTheme] = useState<'normal' | 'sepia' | 'dark'>('normal')
  const [searchOpen, setSearchOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<CanvasHandle | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sound = useReadingSound()
  const router = useRouter()
  const progress = useProgress(flipbookId)

  // Decide se mostra banner de resume · só quando tem progresso > 1 e
  // user não chegou via deep link
  useEffect(() => {
    if (!progress.loaded || !progress.remote) return
    if (initialPage > 1) return
    if (progress.remote.last_page > 1) setShowResumeBanner(true)
  }, [progress.loaded, progress.remote, initialPage])

  const saveFn = progress.save
  const flushFn = progress.flushOnUnload

  // Save progress (debounced) a cada mudança de página
  useEffect(() => {
    if (currentPage <= 1) return
    saveFn(currentPage, totalPages || null)
  }, [currentPage, totalPages, saveFn])

  // Flush no unload · pega só funções estáveis (useCallback)
  useEffect(() => {
    const onUnload = () => flushFn(currentPage, totalPages || null)
    window.addEventListener('beforeunload', onUnload)
    const onVis = () => {
      if (document.visibilityState === 'hidden') onUnload()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [currentPage, totalPages, flushFn])

  async function copyDeepLink() {
    const url = `${window.location.origin}/${slug}?p=${currentPage}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1800)
    } catch {}
  }

  useEffect(() => { if (format === 'pdf') setupPdfWorker() }, [format])

  // Refresh signed URL antes do TTL
  useEffect(() => {
    if (!pdfPath) return
    const refresh = async () => {
      try {
        const res = await fetch('/api/refresh-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pdfPath }),
        })
        if (res.ok) {
          const { signedUrl } = await res.json()
          if (signedUrl) setPdfUrl(signedUrl)
        }
      } catch {}
    }
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [pdfPath])

  // Idle cursor hide em fullscreen
  useEffect(() => {
    if (!isFullscreen) { setCursorHidden(false); return }
    const reset = () => {
      setCursorHidden(false)
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => setCursorHidden(true), IDLE_HIDE_MS)
    }
    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    return () => {
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [isFullscreen])

  const flipNext = () => canvasRef.current?.pageFlip()?.flipNext()
  const flipPrev = () => canvasRef.current?.pageFlip()?.flipPrev()
  const flipTo = (page: number) => {
    const target = Math.max(1, Math.min(totalPages || page, page))
    canvasRef.current?.pageFlip()?.turnToPage(target - 1)
  }

  const onPageChange = (n: number) => {
    setCurrentPage(n)
    sound.play()
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  // Listener de fullscreenchange · sincroniza state se user sair via ESC do browser
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Scroll do mouse · vira página
  // Throttle: react-pageflip tem flippingTime=700ms · bloqueamos durante a animação
  // Threshold: |deltaY| > 24 evita flip acidental em trackpad inertial
  useEffect(() => {
    if (format === 'mobi') return
    const wrap = containerRef.current
    if (!wrap) return
    let lockUntil = 0
    let accum = 0
    const onWheel = (e: WheelEvent) => {
      // Não interceptar se algum painel scrollável estiver focado (search/TOC)
      const target = e.target as HTMLElement | null
      if (target && target.closest('[data-scroll-region]')) return
      e.preventDefault()
      const now = Date.now()
      if (now < lockUntil) return
      accum += e.deltaY
      if (Math.abs(accum) < 24) return
      if (accum > 0) flipNext()
      else flipPrev()
      accum = 0
      lockUntil = now + 720
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [format]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (coverShown && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) {
        setCoverShown(false); return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') flipNext()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') flipPrev()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'p' || e.key === 'P') {
        if (!document.fullscreenElement) toggleFullscreen()
      }
      if (e.key === 'm' || e.key === 'M') sound.toggle()
      if (e.key === 'z' || e.key === 'Z') setZoomLevel((z) => (z + 1) % 3)
      if (e.key === '0') setZoomLevel(0)
      if (e.key === 't' || e.key === 'T') setTheme((t) => t === 'normal' ? 'sepia' : t === 'sepia' ? 'dark' : 'normal')
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'f')) {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
      if (e.key === 'i' || e.key === 'I') setTocOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [coverShown, sound]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderCanvas = () => {
    const common = {
      ref: canvasRef,
      pdfUrl,
      onPageChange,
      onTotalPages: setTotalPages,
      flipbookId,
    }
    switch (format) {
      case 'pdf':  return <FlipbookCanvas {...common} coverUrl={coverUrl} />
      case 'epub': return <EpubCanvas {...common} />
      case 'cbz':  return <CbzCanvas {...common} />
      case 'html': return <HtmlCanvas {...common} />
      case 'mobi': return <UnsupportedFormat format={format} />
      default:     return <UnsupportedFormat format={format} />
    }
  }

  const showControls = format !== 'mobi'

  return (
    <div
      ref={containerRef}
      className={`relative h-screen w-full bg-bg flex flex-col ${cursorHidden ? 'cursor-none' : ''}`}
    >
      {coverShown && (
        <CinematicCover
          coverUrl={coverUrl}
          title={title}
          subtitle={subtitle}
          author={author}
          edition={edition}
          onDismiss={() => setCoverShown(false)}
        />
      )}

      {showResumeBanner && progress.remote && (
        <ResumeBanner
          page={progress.remote.last_page}
          total={progress.remote.total_pages}
          updatedAt={progress.remote.updated_at}
          onResume={() => {
            setShowResumeBanner(false)
            router.push(`/${slug}?p=${progress.remote!.last_page}`)
          }}
          onDismiss={() => setShowResumeBanner(false)}
        />
      )}

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="w-full h-full"
          style={{
            transform: zoomLevel > 0 ? `scale(${1 + zoomLevel * 0.25})` : undefined,
            transformOrigin: 'center center',
            filter: theme === 'sepia'
              ? 'sepia(0.5) saturate(0.9) brightness(0.95)'
              : theme === 'dark'
                ? 'invert(0.92) hue-rotate(180deg) brightness(0.95) contrast(0.95)'
                : undefined,
            transition: 'transform 240ms ease, filter 240ms ease',
          }}
        >
          {renderCanvas()}
        </motion.div>

        {/* Overlay top-left · voltar + título + Amazon */}
        {showControls && (
          <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 bg-bg-elevated/85 backdrop-blur-md border border-border rounded-md p-1 shadow-lg transition-opacity max-w-[calc(100%-280px)] ${cursorHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) router.back()
                else router.push('/')
              }}
              title="Voltar"
              aria-label="Voltar"
              className="p-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition shrink-0"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <div className="hidden sm:flex flex-col min-w-0 px-2 border-l border-border">
              <span className="font-display italic text-text text-xs leading-tight truncate" title={title}>{title}</span>
              {subtitle && (
                <span className="font-meta text-text-dim text-[9px] uppercase tracking-wider truncate">{subtitle}</span>
              )}
            </div>
            {amazonAsin && (
              <a
                href={`https://www.amazon.com/dp/${amazonAsin}`}
                target="_blank"
                rel="noreferrer noopener"
                title="Comprar no Amazon"
                aria-label="Comprar no Amazon"
                className="p-2 rounded text-text-muted hover:text-gold hover:bg-bg-panel transition shrink-0 border-l border-border ml-1"
              >
                <ExternalLink className="w-4 h-4" strokeWidth={1.5} />
              </a>
            )}
          </div>
        )}

        {/* Overlay top-right · controles Heyzine-style */}
        {showControls && (
          <div className={`absolute top-4 right-4 z-20 flex items-center gap-1 bg-bg-elevated/85 backdrop-blur-md border border-border rounded-md p-1 shadow-lg transition-opacity ${cursorHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <OverlayBtn
              Icon={ListOrdered}
              title="Índice de páginas (I)"
              active={tocOpen}
              onClick={() => setTocOpen((v) => !v)}
            />
            <OverlayBtn
              Icon={Search}
              title="Buscar texto (/ ou Ctrl+F)"
              active={searchOpen}
              onClick={() => setSearchOpen((v) => !v)}
            />
            <OverlayBtn
              Icon={theme === 'normal' ? Sun : theme === 'sepia' ? Coffee : Moon}
              title={`Tema · ${theme === 'normal' ? 'normal' : theme === 'sepia' ? 'sépia' : 'escuro'} (T)`}
              active={theme !== 'normal'}
              onClick={() => setTheme((t) => t === 'normal' ? 'sepia' : t === 'sepia' ? 'dark' : 'normal')}
            />
            <OverlayBtn
              Icon={ZoomIn}
              title={zoomLevel === 0 ? 'Zoom (Z)' : `Zoom ${100 + zoomLevel * 25}% · clique pra ${zoomLevel === 2 ? 'voltar' : 'aumentar'}`}
              active={zoomLevel > 0}
              onClick={() => setZoomLevel((z) => (z + 1) % 3)}
            />
            <OverlayBtn
              Icon={isFullscreen ? Minimize2 : Maximize2}
              title="Tela cheia (F)"
              active={isFullscreen}
              onClick={toggleFullscreen}
            />
            <OverlayBtn
              Icon={sound.enabled ? Volume2 : VolumeX}
              title={`Som ${sound.enabled ? 'ligado' : 'desligado'} (M)`}
              active={sound.enabled}
              onClick={sound.toggle}
            />
          </div>
        )}

        {/* Search panel */}
        {searchOpen && format === 'pdf' && (
          <SearchPanel
            pdfUrl={pdfUrl}
            onClose={() => setSearchOpen(false)}
            onJump={(p) => { flipTo(p); setSearchOpen(false) }}
          />
        )}

        {/* TOC sidebar */}
        {tocOpen && format === 'pdf' && totalPages > 0 && (
          <TocSidebar
            pdfUrl={pdfUrl}
            currentPage={currentPage}
            totalPages={totalPages}
            onClose={() => setTocOpen(false)}
            onJump={(p) => { flipTo(p); setTocOpen(false) }}
          />
        )}
      </div>

      {/* Progress bar clicável · jump pra qualquer página */}
      {showControls && totalPages > 0 && (
        <button
          type="button"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
            const ratio = (e.clientX - rect.left) / rect.width
            flipTo(Math.max(1, Math.ceil(ratio * totalPages)))
          }}
          aria-label="Pular pra página"
          className={`relative h-1.5 w-full bg-bg-elevated overflow-hidden transition-opacity hover:h-2 group cursor-pointer ${cursorHidden ? 'opacity-0' : 'opacity-100'}`}
        >
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold-dark via-gold to-gold-light transition-[width] duration-300 ease-out"
            style={{ width: `${(currentPage / Math.max(totalPages, 1)) * 100}%` }}
          />
          {/* Tooltip de hover · mostra página alvo */}
          <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition flex items-center justify-end pr-2 text-[9px] font-meta text-gold-light pointer-events-none">
            click pra ir
          </span>
        </button>
      )}

      {showControls && (
        <div className={`border-t border-border bg-bg-elevated/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-4 transition-opacity ${cursorHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <button onClick={flipPrev} aria-label="Página anterior" className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition">
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="font-meta text-text-muted text-xs">
            {currentPage} <span className="text-text-dim">/</span> {totalPages || '—'}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyDeepLink}
              aria-label="Compartilhar página"
              title={`Copiar link desta página · /${slug}?p=${currentPage}`}
              className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition"
            >
              {linkCopied ? <Check className="w-5 h-5 text-gold" /> : <Link2 className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setCoverShown(true)}
              aria-label="Ver capa"
              title="Ver capa cinematográfica"
              className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition"
            >
              <BookOpen className="w-5 h-5" />
            </button>
            <button onClick={flipNext} aria-label="Próxima página" className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function OverlayBtn({
  Icon, title, active, onClick,
}: { Icon: typeof Maximize2; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded transition ${
        active
          ? 'bg-gold/15 text-gold'
          : 'text-text-muted hover:text-gold hover:bg-bg-panel'
      }`}
    >
      <Icon className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )
}
