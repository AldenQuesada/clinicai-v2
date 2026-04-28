'use client'

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { trackPageView } from '@/lib/utils/trackView'
import { ReaderSkeleton } from '@/components/ui/Skeleton'
import { usePdfPrefetch } from '@/lib/pdf/prefetch'

// Cap do device-pixel-ratio passado pro <Page>. Telas retina (DPR=2-3)
// renderizam canvas 4-9× maior em pixels — cappar em 1.5 economiza
// ~44% de CPU/memory sem perda visual perceptível.
const MAX_DPR = 1.5

// Options do <Document> · referência estável, evita re-fetch do PDF.
const PDF_OPTIONS = { cMapUrl: '/pdfjs/cmaps/', cMapPacked: true }

interface Props {
  pdfUrl: string
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
  coverUrl?: string | null
  /** Desativa trackPageView (usado no editor pra não poluir analytics). */
  noTrack?: boolean
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
  { pdfUrl, onPageChange, onTotalPages, flipbookId, coverUrl, noTrack },
  ref,
) {
  const [numPages, setNumPages] = useState(0)
  const [size, setSize] = useState({ width: 600, height: 840 })
  const [isMobile, setIsMobile] = useState(false)
  const [activePage, setActivePage] = useState(1)
  const [pageAspect, setPageAspect] = useState(1.4) // height/width · default A4-ish
  const [pdfDoc, setPdfDoc] = useState<{
    numPages: number
    getPage: (n: number) => Promise<{
      getOperatorList: () => Promise<unknown>
      getViewport: (opts: { scale: number }) => { width: number; height: number }
    }>
  } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Mede o aspect ratio nativo da primeira página · todas usam essa
  // referência pra manter altura uniforme no spread (sem invasão lateral).
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    pdfDoc.getPage(1).then((page) => {
      if (cancelled) return
      const vp = page.getViewport({ scale: 1 })
      if (vp.width > 0) setPageAspect(vp.height / vp.width)
    }).catch(() => { /* mantém default */ })
    return () => { cancelled = true }
  }, [pdfDoc])

  // Prefetch das páginas próximas em background · cache do pdfjs worker
  // fica quente, virada percebida instantânea. Usa o doc do react-pdf direto.
  usePdfPrefetch(pdfDoc, activePage)

  // DPR cap (uma vez no mount · não muda entre renders)
  const dpr = useMemo(() => {
    if (typeof window === 'undefined') return 1
    return Math.min(window.devicePixelRatio || 1, MAX_DPR)
  }, [])

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

      // Aspect ratio do PDF real (height/width) · medido na 1ª página
      const ratio = pageAspect
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

      // Garante que size.height = size.width * ratio EXATAMENTE.
      // Sem isso, Math.floor pode causar diferença de 1px que se acumula
      // entre página esquerda e direita do spread → invasão lateral.
      const newW = Math.floor(pageW)
      const newH = Math.round(newW * ratio)
      setSize((prev) => (prev.width === newW && prev.height === newH ? prev : { width: newW, height: newH }))
    }

    // Debounce resize · evita re-render de TODAS as páginas a cada pixel
    // arrastado durante drag do fullscreen ou resize de janela.
    let debounceId: ReturnType<typeof setTimeout> | null = null
    const debouncedUpdate = () => {
      if (debounceId) clearTimeout(debounceId)
      debounceId = setTimeout(update, 120)
    }

    update()
    const ro = new ResizeObserver(debouncedUpdate)
    ro.observe(wrap)
    document.addEventListener('fullscreenchange', debouncedUpdate)
    return () => {
      if (debounceId) clearTimeout(debounceId)
      ro.disconnect()
      document.removeEventListener('fullscreenchange', debouncedUpdate)
    }
    // pageAspect só muda quando 1ª página do PDF mede · re-roda update()
  }, [pageAspect])

  const onDocLoad = (doc: {
    numPages: number
    getPage: (n: number) => Promise<{
      getOperatorList: () => Promise<unknown>
      getViewport: (opts: { scale: number }) => { width: number; height: number }
    }>
  }) => {
    setNumPages(doc.numPages)
    onTotalPages(doc.numPages)
    setPdfDoc(doc)
  }

  const lastPageEnter = useRef<{ page: number; t: number } | null>(null)

  const onFlip = (e: { data: number }) => {
    const newPage = e.data + 1
    setActivePage(newPage)
    onPageChange(newPage)
    if (noTrack) return
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
        options={PDF_OPTIONS}
        onLoadSuccess={onDocLoad}
        loading={<CoverLoading coverUrl={coverUrl} size={size} />}
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
            maxShadowOpacity={0.2}
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
                  devicePixelRatio={dpr}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  loading={<PageLoading size={size} />}
                />
              </div>
            ))}
          </HTMLFlipBook>
        )}
      </Document>
    </div>
  )
})

/**
 * Skeleton individual de página · mostrado enquanto o canvas do react-pdf
 * ainda não terminou de renderizar. Shimmer dourado suave em vez de área
 * branca piscando.
 */
function PageLoading({ size }: { size: { width: number; height: number } }) {
  return (
    <div
      className="relative bg-bg-elevated"
      style={{ width: size.width, height: size.height }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(110deg, transparent 30%, rgba(232,177,74,0.08) 50%, transparent 70%)',
          animation: 'shimmer 2.4s infinite',
        }}
      />
    </div>
  )
}

/**
 * Loading state · mostra a capa real (se tiver) com shimmer suave em vez
 * de skeleton genérico. Faz o leitor sentir mais rápido perceptualmente.
 */
function CoverLoading({ coverUrl, size }: { coverUrl?: string | null; size: { width: number; height: number } }) {
  if (!coverUrl) return <ReaderSkeleton />
  return (
    <div className="flex items-center justify-center">
      <div
        className="relative rounded shadow-[var(--shadow-page)] overflow-hidden bg-bg-elevated"
        style={{ width: size.width, height: size.height }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt="Carregando capa"
          className="w-full h-full object-cover"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(110deg, transparent 30%, rgba(232,177,74,0.15) 50%, transparent 70%)',
            animation: 'shimmer 2.4s infinite',
          }}
        />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-meta text-text-dim text-[10px] bg-bg/70 backdrop-blur px-3 py-1.5 rounded">
          carregando…
        </div>
      </div>
    </div>
  )
}
