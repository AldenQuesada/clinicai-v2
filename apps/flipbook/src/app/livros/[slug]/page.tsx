import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug } from '@/lib/supabase/flipbooks'
import { listActiveOffersByBook } from '@/lib/supabase/products'
import { PublicHeader } from '@/components/public/PublicHeader'
import { LandingClient } from './LandingClient'

export const dynamic = 'force-dynamic'

interface RouteProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createServerClient()
  const book = await getFlipbookBySlug(supabase, slug).catch(() => null)
  if (!book) return { title: 'Livro · Flipbook' }

  const landing = (book.metadata as Record<string, unknown>)?.landing as
    | { hero_copy?: { tagline?: string; subheadline?: string } }
    | undefined
  const tagline = landing?.hero_copy?.tagline ?? book.subtitle ?? null
  const description = landing?.hero_copy?.subheadline ?? book.subtitle ?? `${book.title} · ${book.author}`

  return {
    title: `${book.title} · ${book.author}`,
    description,
    openGraph: {
      title: book.title,
      description,
      images: book.cover_url ? [book.cover_url] : undefined,
      type: 'book',
    },
  }
}

export default async function LandingPage({ params }: RouteProps) {
  const { slug } = await params
  const supabase = await createServerClient()

  const book = await getFlipbookBySlug(supabase, slug)
  if (!book || book.status !== 'published') notFound()

  const offersByBook = await listActiveOffersByBook(supabase)
  const bookOffer = offersByBook.get(book.id) ?? null

  return (
    <>
      <PublicHeader />
      <LandingClient book={book} bookOffer={bookOffer} />
    </>
  )
}
