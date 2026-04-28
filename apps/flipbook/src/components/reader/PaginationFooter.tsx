'use client'

import { useEffect, useRef } from 'react'

export type PaginationStyle = 'thumbs-numbers' | 'numbers' | 'thumbs' | 'hidden'

interface Props {
  style: PaginationStyle
  currentPage: number
  totalPages: number
  /** Slug do flipbook · usado pra montar URL do JPEG preview no bucket. */
  slug: string
  /** Quantas páginas têm preview JPEG no bucket flipbook-previews. */
  previewCount: number
  /** URL pública do Supabase storage (process.env.NEXT_PUBLIC_SUPABASE_URL). */
  supabaseUrl: string
  onJump: (page: number) => void
}

const THUMB_W = 56
const THUMB_H = 80

/**
 * Mini-strip de thumbs no rodapé. Mostra todas as páginas que têm preview JPEG
 * (preview_count). Auto-scroll pra página atual. Lazy via loading="lazy".
 */
export function PaginationFooter({
  style, currentPage, totalPages, slug, previewCount, supabaseUrl, onJump,
}: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll thumb ativo pra view
  useEffect(() => {
    if (!activeRef.current) return
    activeRef.current.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [currentPage])

  if (style === 'hidden') return null

  const showThumbs = style === 'thumbs' || style === 'thumbs-numbers'
  const showNumbers = style === 'numbers' || style === 'thumbs-numbers'

  // Quantas páginas mostrar no strip · cap em previewCount (livros sem preview ficam vazios)
  const stripCount = Math.min(previewCount, totalPages || previewCount)

  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      {showThumbs && stripCount > 0 && (
        <div
          ref={stripRef}
          data-scroll-region
          className="flex items-center gap-1 overflow-x-auto max-w-[60vw] py-1 px-1 scrollbar-thin"
          style={{ scrollbarWidth: 'thin' }}
        >
          {Array.from({ length: stripCount }).map((_, i) => {
            const page = i + 1
            const active = page === currentPage
            const url = `${supabaseUrl}/storage/v1/object/public/flipbook-previews/${slug}/page-${page}.jpg`
            return (
              <button
                key={page}
                ref={active ? activeRef : null}
                type="button"
                onClick={() => onJump(page)}
                title={`Página ${page}`}
                aria-label={`Ir pra página ${page}`}
                className={`shrink-0 rounded overflow-hidden border transition ${
                  active
                    ? 'border-gold ring-1 ring-gold/40'
                    : 'border-border opacity-70 hover:opacity-100 hover:border-gold/40'
                }`}
                style={{ width: THUMB_W, height: THUMB_H }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  width={THUMB_W}
                  height={THUMB_H}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover bg-bg-panel"
                  draggable={false}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                />
              </button>
            )
          })}
        </div>
      )}
      {showNumbers && (
        <div className="font-meta text-text-muted text-xs">
          {currentPage} <span className="text-text-dim">/</span> {totalPages || '—'}
        </div>
      )}
    </div>
  )
}
