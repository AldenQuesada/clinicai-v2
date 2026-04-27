'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from 'lucide-react'
import { setupPdfWorker } from '@/lib/pdf/worker'
import { ReaderSkeleton } from '@/components/ui/Skeleton'
import { UnsupportedFormat } from '@/components/reader/UnsupportedFormat'

type Format = 'pdf' | 'epub' | 'mobi' | 'cbz' | 'html'

// Cada renderer client-only
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
}

const REFRESH_INTERVAL_MS = 50 * 60 * 1000

interface CanvasHandle {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void }
}

export function Reader({ pdfUrl: initialUrl, pdfPath, flipbookId, pageCount, format }: Props) {
  const [pdfUrl, setPdfUrl] = useState(initialUrl)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(pageCount ?? 0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<CanvasHandle | null>(null)

  useEffect(() => {
    if (format === 'pdf') setupPdfWorker()
  }, [format])

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

  const flipNext = () => canvasRef.current?.pageFlip()?.flipNext()
  const flipPrev = () => canvasRef.current?.pageFlip()?.flipPrev()

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') flipNext()
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') flipPrev()
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'Escape' && isFullscreen) toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderCanvas = () => {
    const common = {
      ref: canvasRef,
      pdfUrl,
      onPageChange: setCurrentPage,
      onTotalPages: setTotalPages,
      flipbookId,
    }
    switch (format) {
      case 'pdf':  return <FlipbookCanvas {...common} />
      case 'epub': return <EpubCanvas {...common} />
      case 'cbz':  return <CbzCanvas {...common} />
      case 'html': return <HtmlCanvas {...common} />
      case 'mobi': return <UnsupportedFormat format={format} />
      default:     return <UnsupportedFormat format={format} />
    }
  }

  const showControls = format !== 'mobi'

  return (
    <div ref={containerRef} className="relative h-[calc(100vh-65px)] w-full bg-bg flex flex-col">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="w-full h-full"
        >
          {renderCanvas()}
        </motion.div>
      </div>

      {showControls && (
        <div className="border-t border-border bg-bg-elevated/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-4">
          <button onClick={flipPrev} aria-label="Página anterior" className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="font-meta text-text-muted text-xs">
            {currentPage} <span className="text-text-dim">/</span> {totalPages || '—'}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} aria-label="Tela cheia" className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition">
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
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
