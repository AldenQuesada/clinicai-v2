'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { MiniFlipbook } from './MiniFlipbook'

interface Props {
  book: Flipbook | null
  onClose: () => void
}

/**
 * Modal de preview · embeda MiniFlipbook (capa + N páginas + slide CTA).
 * Fecha por: ESC, click no backdrop, botão X.
 *
 * Stub mínimo · Fase 7 expande com lógica de offer (CTA dinâmico baseado em preço).
 */
export function BookPreviewModal({ book, onClose }: Props) {
  useEffect(() => {
    if (!book) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [book, onClose])

  if (!book) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview de ${book.title}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8 animate-in fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 md:top-6 md:right-6 z-10 w-11 h-11 rounded-full bg-bg-elevated/95 border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-lg"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-full overflow-y-auto"
      >
        <MiniFlipbook book={book} />
      </div>
    </div>
  )
}
