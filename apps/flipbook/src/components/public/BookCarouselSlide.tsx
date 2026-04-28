'use client'

import { useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'

interface Props {
  book: Flipbook
  isCenter: boolean
  onSelect: () => void
}

/**
 * Slide individual do BookCarousel · capa do livro com:
 *   - Aspect 2/3 padrão de capa
 *   - Scale 1.05 quando isCenter (destaque visual)
 *   - Tilt parallax desktop (mouse move)
 *   - Botão Play sutil + título no bottom gradient
 *   - Click → onSelect (abre modal preview)
 */
export function BookCarouselSlide({ book, isCenter, onSelect }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 })

  function onMove(e: React.MouseEvent) {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    setTilt({ rx: y * -6, ry: x * 8 })
  }
  function onLeave() {
    setTilt({ rx: 0, ry: 0 })
  }

  return (
    <button
      ref={ref}
      onClick={onSelect}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      aria-label={`Abrir preview de ${book.title}`}
      className={`
        relative block w-full aspect-[2/3] rounded-lg overflow-hidden
        cursor-pointer group transition-all duration-500
        ${isCenter
          ? 'scale-100 lg:scale-105 shadow-[0_30px_80px_rgba(0,0,0,0.7),_0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-gold/30'
          : 'scale-95 opacity-70 lg:opacity-80 hover:opacity-100 shadow-[0_15px_40px_rgba(0,0,0,0.5)]'
        }
      `}
      style={
        isCenter && (tilt.rx !== 0 || tilt.ry !== 0)
          ? {
              // Só sobrescreve transform durante hover (mouse moveu) · sem isso,
              // SSR e client batem (Tailwind lg:scale-105 cuida do scale base).
              transform: `perspective(1400px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
              transition: 'transform 0.4s ease-out',
            }
          : undefined
      }
    >
      {/* Cover image */}
      {book.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.cover_url}
          alt={`Capa de ${book.title}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center p-6"
          style={{ background: '#0E2A47' }}
        >
          <div className="text-center">
            <div className="font-display italic text-gold text-3xl leading-none mb-2">
              {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
            </div>
            <div className="font-meta text-text-muted text-[10px]">{book.author}</div>
          </div>
        </div>
      )}

      {/* Hover overlay com Play */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition">
        <div className="bg-gold/90 text-bg rounded-full w-14 h-14 flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 group-hover:scale-110 transition">
          <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
        </div>
      </div>

      {/* Bottom gradient + título */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/50 to-transparent">
        {book.edition && (
          <div className="font-meta text-gold mb-1 text-[9px]">{book.edition}</div>
        )}
        <div className="font-display text-text text-base md:text-lg leading-tight line-clamp-2">
          {book.title}
        </div>
        {book.subtitle && (
          <div className="font-display italic text-text-muted text-xs mt-0.5 line-clamp-1">
            {book.subtitle}
          </div>
        )}
      </div>
    </button>
  )
}
