'use client'

import { useCallback, useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { BookCarouselSlide } from './BookCarouselSlide'
import { BookPreviewModal } from './BookPreviewModal'

interface Props {
  books: Flipbook[]
  /** Auto-play em ms · default 5000. 0 = desabilita */
  autoplayMs?: number
}

/**
 * Carrossel rotativo de capas. Responsivo:
 *   - Mobile (<640px):       1 slide visível, swipe nativo
 *   - Tablet (640-1024px):   2 slides
 *   - Desktop (>=1024px):    3 slides com central destacado
 *
 * Click/tap em qualquer cover abre o BookPreviewModal com mini-flipbook.
 * Respeita prefers-reduced-motion (Embla Autoplay aceita o flag).
 *
 * Acessibilidade: keyboard nav (← →), aria-roledescription="carousel",
 * dots indicator com aria-current.
 */
export function BookCarousel({ books, autoplayMs = 5000 }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      slidesToScroll: 1,
      dragFree: false,
    },
    autoplayMs > 0
      ? [Autoplay({ delay: autoplayMs, stopOnInteraction: false, stopOnMouseEnter: true })]
      : [],
  )

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([])
  const [previewBook, setPreviewBook] = useState<Flipbook | null>(null)

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    setScrollSnaps(emblaApi.scrollSnapList())
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi])

  // Keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') scrollPrev()
      else if (e.key === 'ArrowRight') scrollNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scrollPrev, scrollNext])

  if (books.length === 0) return null

  return (
    <>
      <section
        aria-roledescription="carousel"
        aria-label="Catálogo de livros"
        className="relative w-full"
      >
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {books.map((book, i) => (
              <div
                key={book.id}
                className="
                  shrink-0 grow-0
                  basis-[80%] sm:basis-[55%] lg:basis-[34%] xl:basis-[28%]
                  px-3 md:px-5
                  transition-all duration-500
                "
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${books.length}: ${book.title}`}
              >
                <BookCarouselSlide
                  book={book}
                  isCenter={i === selectedIndex}
                  onSelect={() => setPreviewBook(book)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Setas · escondidas em mobile (swipe) */}
        {books.length > 1 && (
          <>
            <button
              onClick={scrollPrev}
              aria-label="Anterior"
              className="
                hidden md:flex absolute left-2 lg:left-6 top-1/2 -translate-y-1/2 z-10
                w-11 h-11 rounded-full bg-bg-elevated/95 backdrop-blur border border-border-strong
                items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl
              "
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={scrollNext}
              aria-label="Próximo"
              className="
                hidden md:flex absolute right-2 lg:right-6 top-1/2 -translate-y-1/2 z-10
                w-11 h-11 rounded-full bg-bg-elevated/95 backdrop-blur border border-border-strong
                items-center justify-center text-text-muted hover:text-gold hover:border-gold transition shadow-xl
              "
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Dots indicator */}
        {scrollSnaps.length > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {scrollSnaps.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                aria-label={`Ir para slide ${i + 1}`}
                aria-current={i === selectedIndex ? 'true' : 'false'}
                className={`h-1 rounded-full transition-all ${
                  i === selectedIndex ? 'w-8 bg-gold' : 'w-1.5 bg-border-strong hover:bg-gold/60'
                }`}
              />
            ))}
          </div>
        )}
      </section>

      <BookPreviewModal book={previewBook} onClose={() => setPreviewBook(null)} />
    </>
  )
}
