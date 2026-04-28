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
  preview_count: z.number().default(0),
  amazon_asin: z.string().nullable(),
  published_at: z.string().nullable(),
  status: z.enum(['draft', 'published', 'archived']),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Flipbook = z.infer<typeof FlipbookSchema>

export type FlipbookWithStats = Flipbook & { view_count: number }

export async function listPublishedFlipbooks(supabase: SupabaseClient): Promise<Flipbook[]> {
  const { data, error } = await supabase
    .from('flipbooks')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => FlipbookSchema.parse(row))
}

/**
 * Lista todos flipbooks + view_count agregado (visitantes únicos por
 * `session_id` distinto). Faz 2 queries em paralelo e agrega no client.
 *
 * Trade-off: enquanto `flipbook_views` for pequena (até ~50k linhas), 1
 * SELECT inteiro + agregação JS é mais simples que criar RPC. Quando
 * escalar, trocar por view materializada `flipbook_view_counts`.
 */
export async function listAllFlipbooks(supabase: SupabaseClient): Promise<FlipbookWithStats[]> {
  const [booksRes, viewsRes] = await Promise.all([
    supabase.from('flipbooks').select('*').order('updated_at', { ascending: false }),
    supabase.from('flipbook_views').select('flipbook_id, session_id'),
  ])

  if (booksRes.error) throw booksRes.error
  // viewsRes pode falhar (RLS, etc) sem quebrar a listagem
  const viewsRows = (viewsRes.error ? [] : viewsRes.data) as Array<{ flipbook_id: string; session_id: string }>

  const uniqSessions = new Map<string, Set<string>>()
  for (const v of viewsRows) {
    let set = uniqSessions.get(v.flipbook_id)
    if (!set) { set = new Set(); uniqSessions.set(v.flipbook_id, set) }
    set.add(v.session_id)
  }

  return (booksRes.data ?? []).map((row) => ({
    ...FlipbookSchema.parse(row),
    view_count: uniqSessions.get(row.id)?.size ?? 0,
  }))
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
