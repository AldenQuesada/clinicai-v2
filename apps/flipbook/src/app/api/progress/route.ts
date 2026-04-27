import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const PostSchema = z.object({
  flipbook_id: z.string().uuid(),
  last_page: z.number().int().positive(),
  total_pages: z.number().int().positive().nullable().optional(),
})

/**
 * POST /api/progress · upsert (user_id, flipbook_id) → last_page
 * Silent fail · não bloqueia leitura.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const body = await request.json()
    const parsed = PostSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

    const { error } = await supabase
      .from('flipbook_progress')
      .upsert({
        user_id: user.id,
        flipbook_id: parsed.data.flipbook_id,
        last_page: parsed.data.last_page,
        total_pages: parsed.data.total_pages ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,flipbook_id' })

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

/**
 * GET /api/progress?flipbook_id=X · retorna ultimo progress
 */
export async function GET(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ progress: null })

    const url = new URL(request.url)
    const flipbookId = url.searchParams.get('flipbook_id')
    if (!flipbookId || !z.string().uuid().safeParse(flipbookId).success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    const { data } = await supabase
      .from('flipbook_progress')
      .select('last_page, total_pages, updated_at')
      .eq('user_id', user.id)
      .eq('flipbook_id', flipbookId)
      .maybeSingle()

    return NextResponse.json({ progress: data ?? null })
  } catch {
    return NextResponse.json({ progress: null })
  }
}
