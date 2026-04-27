'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState } from 'react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { Play, BookOpen } from 'lucide-react'
import { MiniFlipbook } from '@/components/public/MiniFlipbook'

/**
 * Preview do livro hero. Despacha entre 3 sub-componentes baseado no estado:
 * - book com preview_count >= 1 → MiniFlipbook (interativo, ler ali)
 * - book sem previews → CoverParallax (capa estática com 3D)
 * - sem book → EmptyState
 */
export function HeroBookPreview({ book }: { book: Flipbook | null }) {
  if (!book) return <EmptyState />
  if ((book.preview_count ?? 0) >= 1) return <MiniFlipbook book={book} />
  return <CoverParallax book={book} />
}

function EmptyState() {
  return (
    <div className="relative aspect-[3/4] max-w-[440px] mx-auto rounded-lg bg-bg-elevated border border-border flex items-center justify-center">
      <div className="text-center px-6">
        <BookOpen className="w-12 h-12 text-gold mx-auto mb-4 opacity-40" strokeWidth={1.2} />
        <div className="font-display italic text-text-muted text-xl">Sem livros publicados ainda</div>
      </div>
    </div>
  )
}

function CoverParallax({ book }: { book: Flipbook }) {
  const [mx, setMx] = useState(0)
  const [my, setMy] = useState(0)

  function onMove(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    setMx((e.clientX - r.left) / r.width - 0.5)
    setMy((e.clientY - r.top) / r.height - 0.5)
  }

  function onLeave() { setMx(0); setMy(0) }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div
        className="absolute -inset-12 opacity-50 blur-3xl pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${50 + mx * 30}% ${50 + my * 30}%, rgba(232,177,74,0.35), transparent 60%)`,
          transition: 'background 0.4s ease-out',
        }}
      />

      <Link href={`/${book.slug}`} className="block relative group">
        <div
          className="relative aspect-[3/4] max-w-[440px] mx-auto rounded-lg overflow-hidden shadow-[0_50px_140px_rgba(0,0,0,0.7),0_15px_40px_rgba(0,0,0,0.5)]"
          style={{
            transform: `perspective(1400px) rotateY(${mx * -10}deg) rotateX(${my * 6}deg)`,
            transition: 'transform 0.4s ease-out',
          }}
        >
          {book.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#0E2A47' }}>
              <div className="text-center px-6">
                <div className="font-display italic text-gold text-5xl mb-3">
                  {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
                </div>
                <div className="font-meta text-[10px]" style={{ color: '#F5F1EA' }}>{book.author}</div>
              </div>
            </div>
          )}

          {/* Play único · centro · hover ou idle subtle */}
          <div className="absolute inset-0 flex items-center justify-center transition bg-black/0 group-hover:bg-black/25">
            <div className="bg-gold/90 text-bg rounded-full w-14 h-14 flex items-center justify-center shadow-2xl opacity-80 group-hover:opacity-100 group-hover:scale-110 transition">
              <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
            {book.edition && (
              <div className="font-meta text-gold mb-1 text-[9px]">{book.edition}</div>
            )}
            <div className="font-display text-text text-lg leading-tight line-clamp-2">{book.title}</div>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}
