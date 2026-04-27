/**
 * Leitor de 1 livro · /[slug]
 * Server Component: carrega metadata + signed URL do PDF, hidrata o Reader client.
 */
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug, getSignedPdfUrl } from '@/lib/supabase/flipbooks'
import { Reader } from './Reader'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
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
      // só admin pode ver não publicados
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) notFound()
    }
    signedUrl = await getSignedPdfUrl(supabase, book.pdf_url)
  } catch {
    notFound()
  }

  return (
    <main className="min-h-screen bg-bg flex flex-col">
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
        />
      </div>
    </main>
  )
}
