import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/leads — captura lead mid-book do Reader.
 *
 * Anon pode submeter (RLS allow). Validamos shape via Zod e logamos
 * source_page/user_agent pra diagnóstico.
 *
 * Idempotência leve: se o mesmo email submeter 2x no mesmo livro em <60s,
 * deixamos passar (não queremos bloquear, mas também não duplica voucher
 * downstream porque o evento `lead_capture_submitted` é o trigger canônico).
 */

const BodySchema = z.object({
  flipbook_id: z.string().uuid(),
  email: z.string().email().max(254),
  whatsapp: z.string().min(8).max(32).optional().or(z.literal('').transform(() => undefined)),
  opt_in_marketing: z.boolean().optional().default(false),
  source_page: z.number().int().positive().optional(),
})

export async function POST(request: Request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
  }

  const supabase = await createServerClient()
  const ua = request.headers.get('user-agent')?.slice(0, 256) ?? null

  const { error } = await supabase.from('flipbook_leads').insert({
    flipbook_id: parsed.data.flipbook_id,
    email: parsed.data.email.toLowerCase().trim(),
    whatsapp: parsed.data.whatsapp ?? null,
    opt_in_marketing: parsed.data.opt_in_marketing,
    source_page: parsed.data.source_page ?? null,
    user_agent: ua,
  })

  if (error) {
    console.warn('[leads] insert falhou:', error.message)
    return NextResponse.json({ error: 'persist_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
