/**
 * CRUD de flipbooks via Supabase.
 * Usa o client SSR (server) ou browser conforme contexto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const FlipbookSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  author: z.string(),
  language: z.enum(['pt', 'en', 'es']),
  edition: z.string().nullable(),
  cover_url: z.string().nullable(),
  pdf_url: z.string(),
  format: z.enum(['pdf', 'epub', 'mobi', 'cbz', 'html']).default('pdf'),
  page_count: z.number().nullable(),
  amazon_asin: z.string().nullable(),
  published_at: z.string().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Flipbook = z.infer<typeof FlipbookSchema>

export async function listPublishedFlipbooks(supabase: SupabaseClient): Promise<Flipbook[]> {
  const { data, error } = await supabase
    .from('flipbooks')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => FlipbookSchema.parse(row))
}

export async function listAllFlipbooks(supabase: SupabaseClient): Promise<Flipbook[]> {
  const { data, error } = await supabase
    .from('flipbooks')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => FlipbookSchema.parse(row))
}

export async function getFlipbookBySlug(supabase: SupabaseClient, slug: string): Promise<Flipbook | null> {
  const { data, error } = await supabase.from('flipbooks').select('*').eq('slug', slug).maybeSingle()

  if (error) throw error
  if (!data) return null
  return FlipbookSchema.parse(data)
}

export async function createFlipbook(
  supabase: SupabaseClient,
  input: Omit<Flipbook, 'id' | 'created_at' | 'updated_at'>,
): Promise<Flipbook> {
  const { data, error } = await supabase.from('flipbooks').insert(input).select('*').single()
  if (error) throw error
  return FlipbookSchema.parse(data)
}

export async function getSignedPdfUrl(supabase: SupabaseClient, pdfPath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('flipbook-pdfs').createSignedUrl(pdfPath, 3600)
  if (error) throw error
  return data.signedUrl
}
