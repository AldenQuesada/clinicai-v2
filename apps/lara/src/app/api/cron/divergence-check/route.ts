/**
 * GET /api/cron/divergence-check · cron daily soak monitoring (Camada 12c).
 *
 * Schedule: 1x/dia 09h30 UTC (06h30 SP) · GitHub Actions lara-crons.yml.
 *
 * Chama RPC `divergence_report()` (mig 800-85) que compara counts entre
 * `legacy_2026_04_28.X` e `public.X` nas 4 tabelas migradas em 2026-04-28.
 *
 * Output:
 *   - 200 + summary JSON sempre (cron passa pra GitHub Actions)
 *   - log estruturado com event_key 'soak.divergence.<status>' pra Sentry
 *     (quando DSN ativo) capturar como mensagem manual
 *
 * Behavior:
 *   - status='ok': info log · nada a fazer
 *   - status='divergent' severity='warning': warn log · investigar
 *   - status='divergent' severity='critical': error log + Sentry capture
 *   - status='legacy_dropped': info log · soak encerrado, cron fica no-op
 *
 * Audit fix N3 (2026-04-27): exige header `x-cron-secret` matching
 * LARA_CRON_SECRET ou CRON_SECRET (timing-safe).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'lara' }).child({ cron: 'divergence-check' })

interface DivergenceResult {
  table: string
  legacy_total: number | null
  legacy_active: number | null
  current_total: number
  current_active: number
  status: 'ok' | 'divergent'
  severity: 'info' | 'warning' | 'critical'
  message: string | null
}

interface DivergenceReport {
  ran_at: string
  status: 'completed' | 'legacy_dropped'
  message?: string
  results?: DivergenceResult[]
  summary?: {
    total: number
    ok: number
    divergent: number
    critical: number
  }
}

export async function GET(req: NextRequest) {
  const reject =
    validateCronSecret(req, 'LARA_CRON_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  const supabase = createServerClient()

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('divergence_report')

    if (error) {
      log.error({ err: error.message }, 'divergence.rpc_failed')
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      )
    }

    const report = data as unknown as DivergenceReport

    // Soak window encerrado · cron vira no-op natural
    if (report.status === 'legacy_dropped') {
      log.info({ event_key: 'soak.legacy_dropped' }, 'soak.divergence.no_op')
      return NextResponse.json({
        success: true,
        status: 'legacy_dropped',
        message: report.message,
      })
    }

    const summary = report.summary!
    const criticals = (report.results ?? []).filter((r) => r.severity === 'critical')
    const warnings = (report.results ?? []).filter((r) => r.severity === 'warning')

    if (criticals.length > 0) {
      log.error(
        {
          event_key: 'soak.divergence.critical',
          summary,
          tables: criticals.map((c) => ({
            table: c.table,
            legacy_active: c.legacy_active,
            current_active: c.current_active,
            message: c.message,
          })),
        },
        'soak.divergence.critical',
      )
    } else if (warnings.length > 0) {
      log.warn(
        {
          event_key: 'soak.divergence.warning',
          summary,
          tables: warnings.map((w) => ({
            table: w.table,
            message: w.message,
          })),
        },
        'soak.divergence.warning',
      )
    } else {
      log.info(
        { event_key: 'soak.divergence.ok', summary },
        'soak.divergence.ok',
      )
    }

    return NextResponse.json({
      success: true,
      ran_at: report.ran_at,
      summary,
      criticals: criticals.length,
      warnings: warnings.length,
    })
  } catch (err) {
    log.error({ err: (err as Error).message }, 'divergence.exception')
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
