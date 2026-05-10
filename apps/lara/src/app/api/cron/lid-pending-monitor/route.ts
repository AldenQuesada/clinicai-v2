/**
 * GET /api/cron/lid-pending-monitor · health-check read-only do pipeline @lid.
 *
 * Step 11E (2026-05-10) · monitor diário.
 *
 * Auth: header `x-cron-secret` ou `Authorization: Bearer <secret>` ·
 * timing-safe via @clinicai/utils. Aceita WA_LID_REPROCESS_SECRET (preferido)
 * ou CRON_SECRET (fallback) · MESMA auth do reprocessador 11D.1.
 *
 * Read-only:
 *   - SOMENTE SELECTs · zero INSERT/UPDATE
 *   - Não chama reprocessador
 *   - Não toca attempts/wa_messages/wa_pending_*
 *   - Não toca webhook Evolution/Cloud
 *
 * 10 sinais de saúde · verdicts: ok | warn_* | fail_*
 *
 * Window default: 24h. Pode ser ajustado via query param `?window_hours=N`
 * (clamp 1-168 · 1h-7d).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateCronSecret } from '@clinicai/utils'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

export const dynamic = 'force-dynamic'

// Thresholds operacionais · ajustar conforme volume real
const PENDING_GROWING_THRESHOLD = 50

interface CheckResult {
  level: 'ok' | 'warn' | 'fail'
  name: string
  detail: string
}

type Verdict =
  | 'ok'
  | 'warn_pending_growing'
  | 'warn_pending_over_24h'
  | 'fail_pending_insert_failed'
  | 'fail_silent_loss_detected'
  | 'fail_reprocessor_errors'

export async function GET(req: NextRequest) {
  // Auth fail-CLOSED · timing-safe · WA_LID_REPROCESS_SECRET preferido,
  // CRON_SECRET fallback · MESMO padrão do reprocessador 11D.1.
  const reject =
    validateCronSecret(req, 'WA_LID_REPROCESS_SECRET') &&
    validateCronSecret(req, 'CRON_SECRET')
  if (reject) {
    return NextResponse.json(reject.body, { status: reject.status })
  }

  // Window configurável · default 24h · clamp 1h-7d
  const url = new URL(req.url)
  const windowRaw = Number(url.searchParams.get('window_hours') ?? 24)
  const window_hours = Math.max(
    1,
    Math.min(168, Number.isFinite(windowRaw) ? Math.floor(windowRaw) : 24),
  )

  log.info({ window_hours }, 'lid_pending_monitor.started')

  const supabase = createServerClient()

  // 9 queries em paralelo · todas SELECT (zero side-effect).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // Helper · roda raw SQL via Supabase JS · todas as queries são SELECT-only.
  // Usamos `.from(...)` puro porque é mais idiomatic e respeita RLS / service_role.

  const [
    pendingTotalRes,
    pendingOver1hRes,
    pendingOver24hRes,
    failedTotalRes,
    drainedWindowRes,
    duplicatesWindowRes,
    oldestPendingRes,
    pendingInsertFailedRes,
    terminalPendingRes,
    silentLossRes,
  ] = await Promise.all([
    // 1. pending_total
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),

    // 2. pending_over_1h
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 1 * 3600 * 1000).toISOString()),

    // 3. pending_over_24h
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),

    // 4. failed_total
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),

    // 5. drained_window
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'drained')
      .gte('resolved_at', new Date(Date.now() - window_hours * 3600 * 1000).toISOString()),

    // 6. duplicates_window
    sb
      .from('wa_pending_lid_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'duplicate')
      .gte('resolved_at', new Date(Date.now() - window_hours * 3600 * 1000).toISOString()),

    // 7. oldest_pending
    sb
      .from('wa_pending_lid_events')
      .select('created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // 8. pending_insert_failed_window (traces evo:pending_lid_event_failed)
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .eq('signature_reason', 'evo:pending_lid_event_failed')
      .gte('hit_at', new Date(Date.now() - window_hours * 3600 * 1000).toISOString()),

    // 9. terminal_pending_window (terminal_pending_identity + terminal_pending_conversation)
    sb
      .from('wa_webhook_log')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', '/api/webhook/whatsapp-evolution')
      .in('signature_reason', [
        'evo:terminal_pending_identity',
        'evo:terminal_pending_conversation',
      ])
      .gte('hit_at', new Date(Date.now() - window_hours * 3600 * 1000).toISOString()),

    // 10. silent_loss_candidates_window · RPC wa_lid_silent_loss_count (11E.1).
    //   Conta DISTINCT provider_msg_id de events messages.upsert @lid sem
    //   senderPn que NÃO existem em wa_messages NEM em wa_pending_lid_events.
    //   Sinal de perda silenciosa real. Read-only · SECURITY DEFINER ·
    //   service_role only · clamp 1-168h.
    sb.rpc('wa_lid_silent_loss_count', { p_window_hours: window_hours }),
  ])

  // Helper · extrai count|null + erro · estrutura uniforme
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (r: any): { count: number; err: string | null } => {
    if (r?.error) return { count: 0, err: String(r.error.message ?? r.error).slice(0, 100) }
    return { count: typeof r?.count === 'number' ? r.count : 0, err: null }
  }

  const pending_total = c(pendingTotalRes)
  const pending_over_1h = c(pendingOver1hRes)
  const pending_over_24h = c(pendingOver24hRes)
  const failed_total = c(failedTotalRes)
  const drained_window = c(drainedWindowRes)
  const duplicates_window = c(duplicatesWindowRes)
  const pending_insert_failed_window = c(pendingInsertFailedRes)
  const terminal_pending_window = c(terminalPendingRes)

  // oldest_pending · single row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldestRow = oldestPendingRes?.data as { created_at?: string } | null
  const oldest_pending_at = oldestRow?.created_at ?? null
  const oldest_pending_brt = oldest_pending_at
    ? new Date(oldest_pending_at).toLocaleString('sv-SE', {
        timeZone: 'America/Sao_Paulo',
      })
    : null

  // silent_loss · 11E.1 · RPC wa_lid_silent_loss_count.
  // Sucesso → number real + rpc_available=true.
  // Erro (RPC ausente, perm negada, timeout) → null + rpc_available=false ·
  // monitor mantém check warn deferred.
  let silent_loss_candidates_window: number | null = null
  let silent_loss_rpc_available = false
  let silent_loss_err: string | null = null
  if (silentLossRes?.error) {
    silent_loss_err = String(
      silentLossRes.error.message ?? silentLossRes.error,
    ).slice(0, 120)
  } else if (typeof silentLossRes?.data === 'number') {
    silent_loss_candidates_window = silentLossRes.data
    silent_loss_rpc_available = true
  } else if (silentLossRes?.data !== null && silentLossRes?.data !== undefined) {
    // resposta não-numérica · trata como erro defensivo
    silent_loss_err = 'rpc_response_non_numeric:' + String(silentLossRes.data).slice(0, 60)
  }

  // Compõe checks descritivos
  const checks: CheckResult[] = []

  if (pending_total.count === 0) {
    checks.push({ level: 'ok', name: 'pending_queue', detail: 'pending=0' })
  } else if (pending_total.count < PENDING_GROWING_THRESHOLD) {
    checks.push({
      level: 'ok',
      name: 'pending_queue',
      detail: 'pending=' + pending_total.count,
    })
  } else {
    checks.push({
      level: 'warn',
      name: 'pending_queue_growing',
      detail: 'pending=' + pending_total.count + ' >= threshold=' + PENDING_GROWING_THRESHOLD,
    })
  }

  if (pending_over_24h.count > 0) {
    checks.push({
      level: 'warn',
      name: 'pending_over_24h',
      detail: 'count=' + pending_over_24h.count + ' oldest_brt=' + (oldest_pending_brt ?? 'null'),
    })
  }

  if (failed_total.count > 0) {
    checks.push({
      level: 'fail',
      name: 'reprocessor_failed_rows',
      detail: 'count=' + failed_total.count,
    })
  }

  if (pending_insert_failed_window.count > 0) {
    checks.push({
      level: 'fail',
      name: 'pending_insert_failed_window',
      detail:
        'count=' + pending_insert_failed_window.count + ' window=' + window_hours + 'h',
    })
  }

  // silent_loss · 11E.1 · RPC ativa.
  if (silent_loss_rpc_available && silent_loss_candidates_window !== null) {
    if (silent_loss_candidates_window === 0) {
      checks.push({
        level: 'ok',
        name: 'silent_loss',
        detail:
          'silent_loss_candidates=0 window=' + window_hours + 'h',
      })
    } else {
      checks.push({
        level: 'fail',
        name: 'silent_loss_detected',
        detail:
          'silent_loss_candidates=' +
          silent_loss_candidates_window +
          ' window=' +
          window_hours +
          'h · provider events @lid sem senderPn não estão em wa_messages nem wa_pending_lid_events',
      })
    }
  } else {
    checks.push({
      level: 'warn',
      name: 'silent_loss_check_unavailable',
      detail:
        'RPC wa_lid_silent_loss_count indisponível · err=' +
        (silent_loss_err ?? 'unknown'),
    })
  }

  if (terminal_pending_window.count > 0) {
    checks.push({
      level: 'ok',
      name: 'terminal_pending_traces',
      detail:
        'count=' + terminal_pending_window.count + ' window=' + window_hours + 'h',
    })
  }

  checks.push({
    level: 'ok',
    name: 'reprocessor_throughput',
    detail:
      'drained=' +
      drained_window.count +
      ' duplicates=' +
      duplicates_window.count +
      ' window=' +
      window_hours +
      'h',
  })

  // Verdict consolidado · ordem de prioridade dos failures.
  // silent_loss > 0 dispara fail_silent_loss_detected (11E.1 · RPC ativa).
  let verdict: Verdict = 'ok'
  if (
    silent_loss_candidates_window !== null &&
    silent_loss_candidates_window > 0
  ) {
    verdict = 'fail_silent_loss_detected'
  } else if (pending_insert_failed_window.count > 0) {
    verdict = 'fail_pending_insert_failed'
  } else if (failed_total.count > 0) {
    verdict = 'fail_reprocessor_errors'
  } else if (pending_over_24h.count > 0) {
    verdict = 'warn_pending_over_24h'
  } else if (pending_total.count >= PENDING_GROWING_THRESHOLD) {
    verdict = 'warn_pending_growing'
  }

  log.info(
    {
      verdict,
      window_hours,
      pending_total: pending_total.count,
      pending_over_24h: pending_over_24h.count,
      failed_total: failed_total.count,
      pending_insert_failed: pending_insert_failed_window.count,
      terminal_pending: terminal_pending_window.count,
      silent_loss: silent_loss_candidates_window,
      drained: drained_window.count,
      duplicates: duplicates_window.count,
    },
    'lid_pending_monitor.summary',
  )

  return NextResponse.json({
    ok: true,
    verdict,
    window_hours,
    pending_total: pending_total.count,
    pending_over_1h: pending_over_1h.count,
    pending_over_24h: pending_over_24h.count,
    failed_total: failed_total.count,
    pending_insert_failed_24h: pending_insert_failed_window.count,
    terminal_pending_24h: terminal_pending_window.count,
    silent_loss_candidates_24h: silent_loss_candidates_window,
    drained_24h: drained_window.count,
    duplicates_24h: duplicates_window.count,
    oldest_pending_brt,
    silent_loss_rpc_available,
    checks,
  })
}
