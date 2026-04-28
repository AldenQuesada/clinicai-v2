'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X, ExternalLink, Share2, Loader2, BookOpen, Check, Copy, Maximize2 } from 'lucide-react'
import type { FlipbookWithStats } from '@/lib/supabase/flipbooks'
import { FlipbookCanvas } from '@/components/reader/FlipbookCanvas'
import { setupPdfWorker } from '@/lib/pdf/worker'

// Inicializa worker do pdfjs uma vez no client
setupPdfWorker()

interface Props {
  book: FlipbookWithStats | null
  onClose: () => void
}

interface FlipApi {
  pageFlip: () => { flipNext: () => void; flipPrev: () => void; turnToPage: (n: number) => void }
}

/**
 * Painel lateral de preview · não-modal · convive com a vitrine.
 * Quando há `book`, ocupa metade direita; vitrine na esquerda. Sem overlay
 * escuro nem block do scroll — é um split layout estilo Heyzine.
 */
export function BookPreviewPanel({ book, onClose }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const flipRef = useRef<FlipApi | null>(null)

  // Esc fecha
  useEffect(() => {
    if (!book) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [book, onClose])

  // Busca signed URL do PDF
  useEffect(() => {
    if (!book) {
      setPdfUrl(null)
      setLoading(true)
      setErr(null)
      return
    }
    if (book.format !== 'pdf') {
      setErr(`Preview do formato ${book.format.toUpperCase()} ainda não disponível`)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetch('/api/refresh-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: book.pdf_url }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`falha ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        if (!json.signedUrl) throw new Error('sem signedUrl')
        setPdfUrl(json.signedUrl)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e.message ?? 'falha ao carregar')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [book])

  async function copyLink() {
    if (!book) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${book.slug}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* noop */ }
  }

  async function shareNative() {
    if (!book) return
    try {
      const url = `${window.location.origin}/${book.slug}`
      if (navigator.share) {
        await navigator.share({ title: book.title, url })
      } else {
        await copyLink()
      }
    } catch { /* user-canceled */ }
  }

  if (!book) return null

  return (
    <aside className="flex flex-col bg-bg-elevated border-l border-border-strong h-full overflow-hidden animate-slide-in-right">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border bg-bg-elevated">
        <BookOpen className="w-4 h-4 text-gold shrink-0" strokeWidth={1.5} />
        <div className="flex-1 min-w-0">
          <div className="font-display italic text-text text-sm truncate" title={book.title}>{book.title}</div>
          <div className="font-meta text-text-dim text-[10px] uppercase tracking-wider">
            {book.format} · {book.page_count ? `${book.page_count} pgs` : '—'}
            {book.view_count > 0 && ` · ${book.view_count} ${book.view_count === 1 ? 'view' : 'views'}`}
          </div>
        </div>
        <Link
          href={`/${book.slug}`}
          target="_blank"
          className="font-meta text-text-muted hover:text-gold transition flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded hover:border-gold/40"
        >
          <Maximize2 className="w-3 h-3" />
          <span className="hidden sm:inline">Tela cheia</span>
        </Link>
        <button
          onClick={onClose}
          aria-label="Fechar preview"
          className="text-text-muted hover:text-text p-2 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Canvas · flipbook ao vivo */}
      <div className="flex-1 relative bg-bg overflow-hidden min-h-[400px]">
        {/* Sempre tem um fallback visível — evita "tela preta" silenciosa */}
        {(!pdfUrl || loading) && !err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted z-10">
            <Loader2 className="w-6 h-6 animate-spin text-gold" />
            <div className="font-meta text-[10px] uppercase tracking-wider">Carregando livro</div>
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center text-center px-8 z-10">
            <div>
              <p className="font-display italic text-red-400 text-lg mb-2">Não foi possível abrir o preview.</p>
              <p className="font-meta text-text-muted text-xs">{err}</p>
            </div>
          </div>
        )}
        {pdfUrl && !err && (
          <div className="absolute inset-0">
            <FlipbookCanvas
              ref={flipRef as React.Ref<unknown>}
              pdfUrl={pdfUrl}
              flipbookId={book.id}
              coverUrl={book.cover_url}
              onPageChange={() => { /* tracking ignorado · noTrack */ }}
              onTotalPages={() => { /* já vem do book.page_count */ }}
              noTrack
            />
          </div>
        )}
      </div>

      {/* Footer · Open in tab / Share / Copy / Close */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border bg-bg-elevated flex-wrap">
        <Link
          href={`/${book.slug}`}
          target="_blank"
          className="font-meta text-xs bg-gold text-bg px-3 py-1.5 rounded hover:bg-gold-light transition flex items-center gap-1.5"
        >
          <ExternalLink className="w-3 h-3" />
          Open in tab
        </Link>
        <button
          onClick={shareNative}
          className="font-meta text-xs text-text-muted hover:text-gold transition flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:border-gold/40"
        >
          <Share2 className="w-3 h-3" />
          Share
        </button>
        <button
          onClick={copyLink}
          className="font-meta text-xs text-text-muted hover:text-gold transition flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:border-gold/40"
        >
          {copied ? <Check className="w-3 h-3 text-gold" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiado!' : 'Copy link'}
        </button>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="font-meta text-xs text-text-muted hover:text-text transition flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:border-border-strong"
        >
          <X className="w-3 h-3" />
          Close
        </button>
      </div>
    </aside>
  )
}
