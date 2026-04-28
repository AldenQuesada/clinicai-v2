import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug } from '@/lib/supabase/flipbooks'
import { LandingEditor } from './LandingEditor'

export const dynamic = 'force-dynamic'

export default async function AdminLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerClient()
  const book = await getFlipbookBySlug(supabase, slug)

  if (!book) notFound()

  return <LandingEditor book={book} />
}
