'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { useState } from 'react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { Play, BookOpen } from 'lucide-react'

/**
 * Preview do livro hero · capa flutuando com parallax 3D + glow + botão Preview.
 * Inspirado no Heyzine mas matching brand luxury dark.
 */
export function HeroBookPreview({ book }: { book: Flipbook | null }) {
  const [mx, setMx] = useState(0)
  const [my, setMy] = useState(0)

  function onMove(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    setMx((e.clientX - r.left) / r.width - 0.5)
    setMy((e.clientY - r.top) / r.height - 0.5)
  }

  function onLeave() { setMx(0); setMy(0) }

  if (!book) {
    return (
      <div className="relative aspect-[3/4] max-w-[440px] mx-auto rounded-lg bg-bg-elevated border border-border flex items-center justify-center">
        <div className="text-center px-6">
          <BookOpen className="w-12 h-12 text-gold mx-auto mb-4 opacity-40" strokeWidth={1.2} />
          <div className="font-display italic text-text-muted text-xl">Sem livros publicados ainda</div>
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1], delay: 0.15 }}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {/* Glow ambient */}
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
            <div className="w-full h-full bg-azul flex items-center justify-center" style={{ background: '#0E2A47' }}>
              <div className="text-center px-6">
                <div className="font-display italic text-gold text-5xl mb-3">
                  {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
                </div>
                <div className="font-meta text-linho text-[10px]" style={{ color: '#F5F1EA' }}>{book.author}</div>
              </div>
            </div>
          )}

          {/* Floating Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30">
            <div className="bg-gold text-bg rounded-full w-16 h-16 flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition">
              <Play className="w-7 h-7 ml-1" fill="currentColor" />
            </div>
          </div>

          {/* Title overlay (canto inferior) */}
          <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
            {book.edition && (
              <div className="font-meta text-gold mb-1 text-[9px]">{book.edition}</div>
            )}
            <div className="font-display text-text text-lg leading-tight line-clamp-2">{book.title}</div>
          </div>
        </div>

        {/* Floating "Preview" button (estilo Heyzine, lado esquerdo da capa) */}
        <div
          className="absolute left-2 lg:-left-6 top-1/2 -translate-y-1/2 bg-bg-elevated border border-border-strong rounded-full w-12 h-12 flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:bg-gold group-hover:border-gold transition"
        >
          <Play className="w-4 h-4 text-gold group-hover:text-bg ml-0.5 transition" fill="currentColor" />
        </div>
      </Link>

      {/* Tagline overlay direita (estilo Heyzine) */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        className="hidden md:block absolute -right-2 lg:-right-8 top-1/2 -translate-y-1/2 max-w-[140px] pointer-events-none"
      >
        <div className="font-display italic text-text-muted text-sm leading-snug">
          publicações editoriais que <span className="text-gold-light">se viram</span>
        </div>
      </motion.div>
    </motion.div>
  )
}
