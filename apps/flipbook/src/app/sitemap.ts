import type { MetadataRoute } from 'next'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Sitemap dinâmico · catálogo + cada livro publicado.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3333'
  const now = new Date()

  let books: { slug: string; updated_at: string }[] = []
  try {
    const supabase = await createServerClient()
    const { data } = await supabase
      .from('flipbooks')
      .select('slug, updated_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000)
    books = (data ?? []) as { slug: string; updated_at: string }[]
  } catch {
    books = []
  }

  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    ...books.map((b) => ({
      url: `${baseUrl}/${b.slug}`,
      lastModified: new Date(b.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ]
}
