import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/track-event — registra evento de conversão (anon ok).
 *
 * Falha silenciosa: analytics não pode quebrar leitura.
 * Body validado por Zod; tipos aceitos espelham o CHECK constraint na mig 0800-55.
 */

const EventSchema = z.object({
  flipbook_id: z.string().uuid(),
  session_id: z.string().min(1).max(64),
  kind: z.enum([
    'amazon_click',
    'lead_capture_shown',
    'lead_capture_dismissed',
    'lead_capture_submitted',
    'share_copy',
    'share_native',
    'fullscreen_enter',
    'cinematic_skip',
    'reading_engaged',
    'reading_complete',
  ]),
  page_number: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = EventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })
    }

    const supabase = await createServerClient()
    const ua = request.headers.get('user-agent')?.slice(0, 256) ?? null

    const { error } = await supabase.from('flipbook_conversion_events').insert({
      flipbook_id: parsed.data.flipbook_id,
      session_id: parsed.data.session_id,
      kind: parsed.data.kind,
      page_number: parsed.data.page_number ?? null,
      metadata: parsed.data.metadata ?? {},
      user_agent: ua,
    })

    if (error) {
      console.warn('[track-event] insert falhou:', error.message)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
