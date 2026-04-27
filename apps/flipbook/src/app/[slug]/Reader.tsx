'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import { setupPdfWorker } from '@/lib/pdf/worker'

// react-pageflip + react-pdf são puramente client-side
const FlipbookCanvas = dynamic(() => import('@/components/reader/FlipbookCanvas').then(m => m.FlipbookCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[calc(100vh-200px)] text-text-muted">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  ),
})

interface Props {
  pdfUrl: string
  pdfPath: string
  flipbookId: string
  pageCount: number | null
}

const REFRESH_INTERVAL_MS = 50 * 60 * 1000 // 50min · signed URL TTL é 60min

export function Reader({ pdfUrl: initialUrl, pdfPath, flipbookId, pageCount }: Props) {
  const [pdfUrl, setPdfUrl] = useState(initialUrl)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(pageCount ?? 0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const flipbookRef = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (n: number) => void } } | null>(null)

  useEffect(() => {
    setupPdfWorker()
  }, [])

  // Refresh signed URL antes do TTL · evita PDF corromper mid-leitura
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
      } catch {
        // best-effort · próxima tentativa em 50min
      }
    }
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [pdfPath])

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

  const flipNext = () => flipbookRef.current?.pageFlip()?.flipNext()
  const flipPrev = () => flipbookRef.current?.pageFlip()?.flipPrev()

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

  return (
    <div ref={containerRef} className="relative h-[calc(100vh-65px)] w-full bg-bg flex flex-col">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="w-full h-full"
        >
          <FlipbookCanvas
            ref={flipbookRef}
            pdfUrl={pdfUrl}
            onPageChange={setCurrentPage}
            onTotalPages={setTotalPages}
            flipbookId={flipbookId}
          />
        </motion.div>
      </div>

      {/* Controls */}
      <div className="border-t border-border bg-bg-elevated/80 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-4">
        <button
          onClick={flipPrev}
          aria-label="Página anterior"
          className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="font-meta text-text-muted text-xs">
          {currentPage} <span className="text-text-dim">/</span> {totalPages || '—'}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            aria-label="Tela cheia"
            className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            onClick={flipNext}
            aria-label="Próxima página"
            className="p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
