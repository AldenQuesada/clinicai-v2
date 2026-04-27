import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const ViewSchema = z.object({
  flipbook_id: z.string().uuid(),
  session_id: z.string().min(1).max(64),
  page_number: z.number().int().positive(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
})

/**
 * POST /api/views — registra leitura de página.
 * Anon pode chamar (RLS permite insert sem auth).
 * Falha silenciosamente: analytics não pode quebrar leitura.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = ViewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const ua = request.headers.get('user-agent')?.slice(0, 256) ?? null

    const { error } = await supabase.from('flipbook_views').insert({
      flipbook_id: parsed.data.flipbook_id,
      session_id: parsed.data.session_id,
      page_number: parsed.data.page_number,
      duration_ms: parsed.data.duration_ms ?? null,
      user_agent: ua,
    })

    if (error) {
      console.warn('[views] insert falhou:', error.message)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
