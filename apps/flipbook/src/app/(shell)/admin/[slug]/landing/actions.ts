'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * Schema do bloco `metadata.landing` editável via UI.
 * Vive em flipbooks.metadata.landing (jsonb) — sem migration necessária.
 *
 * Renderizado por /livros/[slug]/page.tsx (landing pública). Campos vazios
 * são tratados como "não exibir" no Server Component.
 */
export const LandingSchema = z.object({
  hero_copy: z
    .object({
      tagline: z.string().max(120).optional().nullable(),
      headline_override: z.string().max(180).optional().nullable(),
      subheadline: z.string().max(400).optional().nullable(),
    })
    .partial()
    .optional()
    .nullable(),
  benefits: z
    .array(z.object({ title: z.string().max(80), body: z.string().max(280) }))
    .max(8)
    .optional(),
  faq: z
    .array(z.object({ q: z.string().max(180), a: z.string().max(800) }))
    .max(15)
    .optional(),
  guarantee: z.string().max(400).optional().nullable(),
})

export type LandingMeta = z.infer<typeof LandingSchema>

export async function updateLandingMetadataAction(
  bookId: string,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = LandingSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(' · ') }
  }

  const supabase = await createServerClient()

  // Merge no metadata existente sem sobrescrever outras chaves
  const { data: current, error: fetchErr } = await supabase
    .from('flipbooks')
    .select('metadata, slug')
    .eq('id', bookId)
    .single()

  if (fetchErr) return { ok: false, error: fetchErr.message }

  const nextMetadata = {
    ...((current?.metadata ?? {}) as Record<string, unknown>),
    landing: parsed.data,
  }

  const { error } = await supabase
    .from('flipbooks')
    .update({ metadata: nextMetadata })
    .eq('id', bookId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/${current?.slug}/landing`)
  revalidatePath(`/livros/${current?.slug}`)
  return { ok: true }
}
