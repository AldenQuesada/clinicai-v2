/**
 * Helpers compartilhados pelos 11 cron handlers Mira.
 *
 * - timingSafeEqual: comparacao de header secret resistente a timing attack
 * - validateCronSecret: lê env MIRA_CRON_SECRET + header `x-cron-secret`
 * - getCronContext: cria service-role client + clinicId resolvido via _default_clinic_id()
 *
 * Crons rodam SEM cookies/JWT · service role bypass RLS, multi-tenant resolvido
 * pela RPC `_default_clinic_id()` (mono-clinica em P1).
 */

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import { makeMiraRepos, type MiraRepos } from '@/lib/repos'
import { resolveClinicId } from '@/lib/clinic'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'mira' })

export function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function validateCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.MIRA_CRON_SECRET ?? ''
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'cron_secret_missing' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret') ?? ''
  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  return null
}

export interface CronContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  repos: MiraRepos
  clinicId: string
  cronName: string
}

export async function getCronContext(cronName: string): Promise<CronContext> {
  const supabase = createServerClient()
  const repos = makeMiraRepos(supabase)
  const clinicId = await resolveClinicId(supabase)
  return { supabase, repos, clinicId, cronName }
}

/**
 * Wrapper canonico pra crons. Lida com auth + try/catch + telemetria + audit.
 * Caller passa um handler que recebe ctx e retorna o payload customizado.
 */
export async function runCron(
  req: NextRequest,
  cronName: string,
  handler: (ctx: CronContext) => Promise<Record<string, unknown> | object>,
): Promise<NextResponse> {
  const reject = validateCronSecret(req)
  if (reject) return reject

  const startedAt = Date.now()
  try {
    const ctx = await getCronContext(cronName)
    const result = await handler(ctx)
    const ms = Date.now() - startedAt
    return NextResponse.json({
      ok: true,
      cron: cronName,
      duration_ms: ms,
      ...result,
    })
  } catch (err) {
    log.error({ err, cron: cronName }, 'mira.cron.failed')
    return NextResponse.json(
      {
        ok: false,
        cron: cronName,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
