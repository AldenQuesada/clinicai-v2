import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug, getSignedPdfUrl } from '@/lib/supabase/flipbooks'
import { Reader } from './Reader'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const supabase = await createServerClient()
    const book = await getFlipbookBySlug(supabase, slug)
    if (!book || book.status !== 'published') return { title: 'Livro · Flipbook' }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3333'
    const url = `${baseUrl}/${book.slug}`
    const desc = book.subtitle ?? `${book.title} · ${book.author} · leia online em flipbook digital`

    return {
      title: `${book.title} · ${book.author}`,
      description: desc,
      alternates: { canonical: url },
      openGraph: {
        type: 'book',
        url,
        title: book.title,
        description: desc,
        siteName: 'Flipbook',
        locale: book.language === 'en' ? 'en_US' : book.language === 'es' ? 'es_ES' : 'pt_BR',
        images: book.cover_url ? [{ url: book.cover_url, width: 600, height: 840, alt: book.title }] : [],
      },
      twitter: {
        card: book.cover_url ? 'summary_large_image' : 'summary',
        title: book.title,
        description: desc,
        images: book.cover_url ? [book.cover_url] : [],
      },
    }
  } catch {
    return { title: 'Livro · Flipbook' }
  }
}

export default async function ReaderPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createServerClient()

  let book
  let signedUrl
  try {
    book = await getFlipbookBySlug(supabase, slug)
    if (!book) notFound()
    if (book.status !== 'published') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) notFound()
    }
    signedUrl = await getSignedPdfUrl(supabase, book.pdf_url)
  } catch {
    notFound()
  }

  // Schema.org Book JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    inLanguage: book.language === 'en' ? 'en' : book.language === 'es' ? 'es' : 'pt-BR',
    bookFormat: 'EBook',
    image: book.cover_url ?? undefined,
    isbn: undefined,
    numberOfPages: book.page_count ?? undefined,
    description: book.subtitle ?? undefined,
    ...(book.amazon_asin ? { sameAs: `https://www.amazon.com/dp/${book.amazon_asin}` } : {}),
  }

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-4">
        <Link href="/" className="font-meta text-text-muted hover:text-gold transition flex items-center gap-2">
          <ArrowLeft className="w-3 h-3" /> Catálogo
        </Link>
        <div className="text-center min-w-0 flex-1 px-4">
          <div className="font-display text-text text-base md:text-lg truncate">{book.title}</div>
          {book.subtitle && (
            <div className="font-display italic text-text-muted text-xs md:text-sm truncate">{book.subtitle}</div>
          )}
        </div>
        {book.amazon_asin ? (
          <a
            href={`https://www.amazon.com/dp/${book.amazon_asin}`}
            target="_blank"
            rel="noreferrer noopener"
            className="font-meta text-gold hover:text-gold-light transition flex items-center gap-1.5"
          >
            Amazon <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="w-20" />
        )}
      </header>

      <div className="flex-1">
        <Reader
          pdfUrl={signedUrl}
          pdfPath={book.pdf_url}
          flipbookId={book.id}
          pageCount={book.page_count}
          format={book.format}
          title={book.title}
          subtitle={book.subtitle}
          author={book.author}
          edition={book.edition}
          coverUrl={book.cover_url}
        />
      </div>
    </main>
  )
}
