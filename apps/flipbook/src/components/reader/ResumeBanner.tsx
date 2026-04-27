'use client'

import { motion } from 'framer-motion'
import { Bookmark, X } from 'lucide-react'

interface Props {
  page: number
  total: number | null
  updatedAt: string
  onResume: () => void
  onDismiss: () => void
}

/**
 * Banner que aparece quando user logado tem progress salvo de outro device.
 * Auto-some após dismiss ou aceitar.
 */
export function ResumeBanner({ page, total, updatedAt, onResume, onDismiss }: Props) {
  const ago = relativeTime(updatedAt)
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-bg-elevated border border-gold/30 rounded-lg shadow-2xl px-5 py-3 flex items-center gap-4 max-w-md"
    >
      <Bookmark className="w-5 h-5 text-gold shrink-0" strokeWidth={1.5} />
      <div className="min-w-0">
        <div className="text-sm text-text">
          Você parou na <strong className="text-gold">página {page}{total ? ` de ${total}` : ''}</strong>
        </div>
        <div className="font-meta text-text-dim text-[10px]">{ago}</div>
      </div>
      <button
        onClick={onResume}
        className="font-meta text-bg bg-gold px-3 py-1.5 rounded hover:bg-gold-light transition text-xs whitespace-nowrap"
      >
        Continuar
      </button>
      <button
        onClick={onDismiss}
        aria-label="Fechar"
        className="p-1 -mr-1 text-text-dim hover:text-text transition"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h atrás`
  const d = Math.floor(h / 24)
  return `${d} dia${d > 1 ? 's' : ''} atrás`
}
