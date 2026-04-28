'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { pdfjs } from 'react-pdf'
import { cn } from '@/lib/utils/cn'

interface Props {
  pdfUrl: string
  currentPage: number
  totalPages: number
  onClose: () => void
  onJump: (page: number) => void
  /**
   * Lista custom de entradas (do `settings.toc.entries`). Quando preenchida,
   * o sidebar mostra "Sumário do autor" em vez dos thumbs página-a-página.
   */
  customEntries?: Array<{ label: string; page: number }>
}

const THUMB_WIDTH = 140
const THUMB_HEIGHT = 196 // ~aspect 1.4

/**
 * Sidebar lateral com mini-thumbnails de todas as páginas. Renderização
 * lazy via IntersectionObserver — só rasteriza thumbs visíveis no
 * viewport pra não estourar memória/CPU em livros longos.
 */
export function TocSidebar({ pdfUrl, currentPage, totalPages, onClose, onJump, customEntries }: Props) {
  // Esc fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const useCustom = !!customEntries && customEntries.length > 0

  return (
    <div data-scroll-region className="absolute top-0 left-0 bottom-0 z-30 w-[240px] bg-bg-elevated/95 backdrop-blur-md border-r border-border-strong shadow-2xl flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <span className="font-meta text-gold text-[10px] uppercase tracking-wider flex-1">
          {useCustom ? 'Sumário do autor' : `Páginas · ${totalPages}`}
        </span>
        <button onClick={onClose} aria-label="Fechar" className="text-text-muted hover:text-text p-1 transition">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {useCustom ? (
        <ul className="flex-1 overflow-y-auto p-1">
          {customEntries!.map((entry, i) => {
            const active = currentPage >= entry.page && (i === customEntries!.length - 1 || currentPage < customEntries![i + 1].page)
            return (
              <li key={`${entry.page}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJump(entry.page)}
                  className={`w-full text-left px-3 py-2 rounded transition flex items-baseline gap-3 ${
                    active
                      ? 'bg-gold/10 text-gold ring-1 ring-gold/30'
                      : 'text-text-muted hover:bg-bg-panel hover:text-text'
                  }`}
                >
                  <span className="font-display text-sm leading-snug flex-1 min-w-0 break-words">{entry.label}</span>
                  <span className="font-meta text-[9px] uppercase tracking-wider opacity-70 shrink-0">{entry.page}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {Array.from({ length: totalPages }).map((_, i) => (
            <ThumbRow
              key={i}
              page={i + 1}
              pdfUrl={pdfUrl}
              active={currentPage === i + 1}
              onClick={() => onJump(i + 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ThumbRow({
  page, pdfUrl, active, onClick,
}: { page: number; pdfUrl: string; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)
  const [visible, setVisible] = useState(false)

  // Lazy: detect quando entra no viewport
  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Render quando visível
  useEffect(() => {
    if (!visible || rendered) return
    let cancelled = false
    ;(async () => {
      try {
        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise
        if (cancelled) return
        const pdfPage = await doc.getPage(page)
        if (cancelled) return
        const viewport = pdfPage.getViewport({ scale: 1 })
        const scale = THUMB_WIDTH / viewport.width
        const scaled = pdfPage.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = scaled.width
        canvas.height = scaled.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        await pdfPage.render({ canvasContext: ctx, viewport: scaled }).promise
        if (!cancelled) setRendered(true)
      } catch { /* noop · thumb falhar não quebra UX */ }
    })()
    return () => { cancelled = true }
  }, [visible, rendered, page, pdfUrl])

  // Auto-scroll pro thumb ativo
  useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [active])

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'w-full flex flex-col items-center gap-1 p-1 rounded transition relative',
        active
          ? 'bg-gold/10 ring-1 ring-gold'
          : 'hover:bg-bg-panel',
      )}
    >
      <div
        className="relative bg-white rounded shadow overflow-hidden"
        style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
      >
        <canvas ref={canvasRef} className={rendered ? 'block w-full h-full' : 'hidden'} />
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-panel">
            <Loader2 className="w-3 h-3 animate-spin text-gold opacity-60" />
          </div>
        )}
      </div>
      <span className={cn(
        'font-meta text-[9px]',
        active ? 'text-gold' : 'text-text-dim',
      )}>
        {page}
      </span>
    </button>
  )
}
