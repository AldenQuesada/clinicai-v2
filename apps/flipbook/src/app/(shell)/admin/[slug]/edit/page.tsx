import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug, getSignedPdfUrl } from '@/lib/supabase/flipbooks'
import { EditorClient } from './EditorClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function EditorPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createServerClient()
  const book = await getFlipbookBySlug(supabase, slug)
  if (!book) notFound()

  // Signed URL pro PDF (se for formato PDF)
  let pdfUrl: string | null = null
  if (book.format === 'pdf' && book.pdf_url) {
    try {
      pdfUrl = await getSignedPdfUrl(supabase, book.pdf_url)
    } catch {
      pdfUrl = null
    }
  }

  return <EditorClient book={book} pdfUrl={pdfUrl} />
}
