'use client'

import { useState } from 'react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import type { BookOffer } from '@/lib/supabase/products'
import { BookCarousel } from '@/components/public/BookCarousel'
import { BuyModal } from '@/components/public/BuyModal'

interface Props {
  books: Flipbook[]
  /** Offers serializadas como array (Map não atravessa Server→Client) */
  offers: Array<{ flipbookId: string; offer: BookOffer }>
}

/**
 * Wrapper Client da seção de carousel da home · une BookCarousel + BuyModal.
 * Carousel emite onBuyRequest(book, offer) → abre modal de compra global.
 */
export function HomeCarouselSection({ books, offers }: Props) {
  const offersByBookId = new Map<string, BookOffer>()
  for (const { flipbookId, offer } of offers) {
    offersByBookId.set(flipbookId, offer)
  }

  const [buyOpen, setBuyOpen] = useState<{ book: Flipbook; bookOffer: BookOffer } | null>(null)

  return (
    <>
      <BookCarousel
        books={books}
        offersByBookId={offersByBookId}
        onBuyRequest={(book, bookOffer) => setBuyOpen({ book, bookOffer })}
        autoplayMs={5000}
      />
      <BuyModal open={buyOpen} onClose={() => setBuyOpen(null)} />
    </>
  )
}
