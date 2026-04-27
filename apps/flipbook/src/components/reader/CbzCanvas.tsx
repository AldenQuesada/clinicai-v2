'use client'

import { forwardRef, useEffect, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import JSZip from 'jszip'
import { ReaderSkeleton } from '@/components/ui/Skeleton'

interface Props {
  pdfUrl: string  // signed URL · serve CBZ também
  onPageChange: (n: number) => void
  onTotalPages: (n: number) => void
  flipbookId: string
}

const IMG_EXT = /\.(jpe?g|png|gif|webp)$/i

/**
 * Reader CBZ (zip de imagens). Cada imagem vira 1 página do flipbook.
 * Lazy load: extrai cada página sob demanda pra não estourar memória.
 */
export const CbzCanvas = forwardRef<unknown, Props>(function CbzCanvas(
  { pdfUrl, onPageChange, onTotalPages, flipbookId },
  ref,
) {
  const [pages, setPages] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [size, setSize] = useState({ width: 600, height: 840 })
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight - 130
      const mobile = w < 768
      setIsMobile(mobile)
      const ratio = 1.4
      let pw = mobile ? Math.min(w - 32, 480) : Math.min(h - 32, 900) / ratio
      let ph = pw * ratio
      if (mobile && ph > h - 16) { ph = h - 16; pw = ph / ratio }
      setSize({ width: Math.floor(pw), height: Math.floor(ph) })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(pdfUrl)
        if (!res.ok) throw new Error('Falha ao baixar CBZ')
        const buf = await res.arrayBuffer()
        const zip = await JSZip.loadAsync(buf)

        const files = Object.keys(zip.files)
          .filter((name) => IMG_EXT.test(name) && !zip.files[name].dir)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

        if (cancelled) return

        // gera object URLs pra cada página
        const urls: string[] = []
        for (const name of files) {
          const blob = await zip.files[name].async('blob')
          urls.push(URL.createObjectURL(blob))
          if (cancelled) return
        }

        setPages(urls)
        onTotalPages(urls.length)
        setLoading(false)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao abrir CBZ'
        setError(msg)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [pdfUrl, onTotalPages])

  const onFlip = (e: { data: number }) => onPageChange(e.data + 1)

  if (loading) return <ReaderSkeleton />
  if (error) return <div className="text-red-400 text-center p-8 font-display italic text-xl">{error}</div>
  if (pages.length === 0) return <div className="text-text-muted p-8 text-center">CBZ sem imagens.</div>

  return (
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
      {pages.map((url, i) => (
        <div key={`${flipbookId}-${i}`} className="flipbook-page flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Página ${i + 1}`} className="max-w-full max-h-full object-contain" loading={i < 3 ? 'eager' : 'lazy'} />
        </div>
      ))}
    </HTMLFlipBook>
  )
})
