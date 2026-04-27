import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'

const Schema = z.object({ path: z.string().min(1).max(512) })

/**
 * POST /api/refresh-url — gera nova signed URL pra um PDF (TTL 1h).
 * Reader chama periodicamente pra evitar URL expirar mid-leitura.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

    const supabase = await createServerClient()
    const { data, error } = await supabase.storage.from('flipbook-pdfs').createSignedUrl(parsed.data.path, 3600)
    if (error || !data) return NextResponse.json({ error: 'sign failed' }, { status: 500 })

    return NextResponse.json({ signedUrl: data.signedUrl, expiresIn: 3600 })
  } catch {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
