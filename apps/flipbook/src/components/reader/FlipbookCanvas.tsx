'use client'

import { forwardRef, useEffect, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

interface Props {
  pdfUrl: string
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

/**
 * Renderiza o PDF como flipbook. react-pageflip gerencia o swap das páginas
 * com efeito 3D; cada página é um <Page /> do react-pdf.
 *
 * Mobile-first: detecta width < 768 e força single-page; desktop usa double spread.
 *
 * TODO v1.1: refatorar pra suportar EPUB/CBZ — abstrair "page renderer" como prop.
 */
export const FlipbookCanvas = forwardRef<unknown, Props>(function FlipbookCanvas(
  { pdfUrl, onPageChange, onTotalPages, flipbookId },
  ref,
) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState({ width: 600, height: 840 })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight - 130
      const mobile = w < 768
      setIsMobile(mobile)

      // aspect ratio padrão A5/livro: ~1.4
      const ratio = 1.4
      let pageW: number
      let pageH: number

      if (mobile) {
        pageW = Math.min(w - 32, 480)
        pageH = pageW * ratio
        if (pageH > h - 16) {
          pageH = h - 16
          pageW = pageH / ratio
        }
      } else {
        pageH = Math.min(h - 32, 900)
        pageW = pageH / ratio
        const totalW = pageW * 2 + 32
        if (totalW > w - 64) {
          const newTotalW = w - 64
          pageW = (newTotalW - 32) / 2
          pageH = pageW * ratio
        }
      }

      setSize({ width: Math.floor(pageW), height: Math.floor(pageH) })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const onDocLoad = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    onTotalPages(numPages)
  }

  const onFlip = (e: { data: number }) => {
    onPageChange(e.data + 1)
    // TODO v1.1: chamar /api/views pra registrar leitura
  }

  return (
    <Document
      file={pdfUrl}
      onLoadSuccess={onDocLoad}
      loading={<div className="text-text-muted text-center p-8">Carregando livro…</div>}
      error={<div className="text-red-400 text-center p-8">Falha ao carregar o PDF.</div>}
      className="flex items-center justify-center w-full h-full"
    >
      {numPages > 0 && (
        <HTMLFlipBook
          ref={ref as React.Ref<typeof HTMLFlipBook>}
          width={size.width}
          height={size.height}
          size="fixed"
          minWidth={200}
          maxWidth={1200}
          minHeight={300}
          maxHeight={1800}
          drawShadow
          flippingTime={800}
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
  )
})
