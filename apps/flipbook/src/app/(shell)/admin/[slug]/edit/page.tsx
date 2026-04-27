import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getFlipbookBySlug } from '@/lib/supabase/flipbooks'
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

  return <EditorClient book={book} />
}
