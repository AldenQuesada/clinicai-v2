'use client'

import { forwardRef, useEffect, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { trackPageView } from '@/lib/utils/trackView'
import { ReaderSkeleton } from '@/components/ui/Skeleton'

interface Props {
  pdfUrl: string
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

/**
 * Renderiza o PDF como flipbook. react-pageflip gerencia swap das páginas
 * com efeito 3D; cada página é um <Page /> do react-pdf.
 *
 * Cálculo de tamanho usa o CONTAINER REAL (ResizeObserver) — funciona
 * tanto inline quanto em fullscreen sem cortar a página.
 *
 * Mobile-first: width < 768 → single-page (sem double spread).
 */
export const FlipbookCanvas = forwardRef<unknown, Props>(function FlipbookCanvas(
  { pdfUrl, onPageChange, onTotalPages, flipbookId },
  ref,
) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState({ width: 600, height: 840 })
  const [isMobile, setIsMobile] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!wrapRef.current) return
    const wrap = wrapRef.current

    const update = () => {
      const rect = wrap.getBoundingClientRect()
      // Padding interno minimo pra sombra do flip + margem de respiro
      const w = Math.max(280, rect.width - 32)
      const h = Math.max(400, rect.height - 32)
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)

      // Aspect ratio padrão livro: 1.4
      const ratio = 1.4
      let pageW: number
      let pageH: number

      if (mobile) {
        // Single page · ajusta pelo menor lado
        pageW = Math.min(w, 520)
        pageH = pageW * ratio
        if (pageH > h) { pageH = h; pageW = pageH / ratio }
      } else {
        // Double spread · 2 páginas lado a lado
        pageH = Math.min(h, 1080)
        pageW = pageH / ratio
        const totalW = pageW * 2
        if (totalW > w) {
          pageW = w / 2
          pageH = pageW * ratio
          if (pageH > h) { pageH = h; pageW = pageH / ratio }
        }
      }

      setSize({ width: Math.floor(pageW), height: Math.floor(pageH) })
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    document.addEventListener('fullscreenchange', update)
    return () => {
      ro.disconnect()
      document.removeEventListener('fullscreenchange', update)
    }
  }, [])

  const onDocLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    onTotalPages(numPages)
  }

  const lastPageEnter = useRef<{ page: number; t: number } | null>(null)

  const onFlip = (e: { data: number }) => {
    const newPage = e.data + 1
    onPageChange(newPage)
    const now = Date.now()
    if (lastPageEnter.current) {
      const prev = lastPageEnter.current
      const durationMs = now - prev.t
      if (durationMs >= 1500) {
        trackPageView({ flipbookId, pageNumber: prev.page, durationMs })
      }
    }
    lastPageEnter.current = { page: newPage, t: now }
  }

  return (
    <div ref={wrapRef} className="w-full h-full flex items-center justify-center overflow-hidden">
      <Document
        file={pdfUrl}
        onLoadSuccess={onDocLoad}
        loading={<ReaderSkeleton />}
        error={<div className="text-red-400 text-center p-8 font-display italic text-xl">Falha ao carregar o PDF.</div>}
        className="flex items-center justify-center"
      >
        {numPages > 0 && (
          <HTMLFlipBook
            ref={ref as React.Ref<typeof HTMLFlipBook>}
            width={size.width}
            height={size.height}
            size="fixed"
            minWidth={200}
            maxWidth={1600}
            minHeight={300}
            maxHeight={2200}
            drawShadow
            flippingTime={700}
            usePortrait={isMobile}
            startZIndex={0}
            autoSize={false}
            maxShadowOpacity={0.5}
            showCover
            mobileScrollSupport
            clickEventForward
            useMouseEvents
            swipeDistance={30}
            showPageCorners
            disableFlipByClick={false}
            startPage={0}
            onFlip={onFlip}
            className="flipbook-shell"
            style={{}}
          >
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={`${flipbookId}-${i}`} className="flipbook-page">
                <Page
                  pageNumber={i + 1}
                  width={size.width}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </div>
            ))}
          </HTMLFlipBook>
        )}
      </Document>
    </div>
  )
})
