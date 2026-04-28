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
import type { Database } from '@clinicai/supabase'

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
  supabase: SupabaseClient<Database>
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
 *
 * Mig 800-15: integra com mira_cron_jobs/runs. Antes de executar, checa se
 * o job esta enabled pra clinica (runStart retorna NULL se desligado · cron
 * faz noop). Apos executar, registra finish (success/failed/items).
 *
 * Handler pode retornar { itemsProcessed?: number, ... } pra alimentar
 * mira_cron_runs.items_processed (UI mostra "5 admins notificados").
 */
export async function runCron(
  req: NextRequest,
  cronName: string,
  handler: (ctx: CronContext) => Promise<Record<string, unknown> | object>,
): Promise<NextResponse> {
  const reject = validateCronSecret(req)
  if (reject) return reject

  const startedAt = Date.now()

  // Setup ctx ANTES do tracking (precisa clinicId)
  let ctx: CronContext
  try {
    ctx = await getCronContext(cronName)
  } catch (err) {
    log.error({ err, cron: cronName }, 'mira.cron.ctx_failed')
    return NextResponse.json(
      {
        ok: false,
        cron: cronName,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // Tenta start no registry · se NULL, job desligado · noop ack
  let runId: string | null = null
  try {
    runId = await ctx.repos.miraCronRegistry.runStart(cronName, ctx.clinicId)
  } catch (err) {
    // Registry indisponivel (mig nao aplicada · tabelas nao existem etc) · loga
    // warn e continua sem tracking · cron NAO bloqueia se registry quebra
    log.warn(
      { err, cron: cronName },
      'mira.cron.registry_unavailable_continuing',
    )
  }

  if (runId === null && process.env.MIRA_CRON_REGISTRY_ENFORCED === 'true') {
    // Modo "estrito": registry obrigatorio. Default OFF · liga depois que
    // mig 800-15 estiver aplicada em todos ambientes.
    return NextResponse.json({
      ok: true,
      cron: cronName,
      skipped: true,
      reason: 'job_disabled_or_registry_unavailable',
    })
  }

  try {
    const result = (await handler(ctx)) as Record<string, unknown>
    const ms = Date.now() - startedAt
    const items = Number(result?.itemsProcessed ?? result?.items ?? 0) || 0

    if (runId) {
      await ctx.repos.miraCronRegistry
        .runFinish(runId, 'success', items, null, { duration_ms: ms })
        .catch((e) => {
          log.warn({ err: e, cron: cronName, runId }, 'mira.cron.run_finish_failed')
        })
    }

    return NextResponse.json({
      ok: true,
      cron: cronName,
      duration_ms: ms,
      run_id: runId,
      ...result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error({ err, cron: cronName }, 'mira.cron.failed')

    if (runId) {
      await ctx.repos.miraCronRegistry
        .runFinish(runId, 'failed', 0, msg)
        .catch(() => {
          // best-effort
        })
    }

    return NextResponse.json(
      {
        ok: false,
        cron: cronName,
        error: msg,
        run_id: runId,
      },
      { status: 500 },
    )
  }
}
