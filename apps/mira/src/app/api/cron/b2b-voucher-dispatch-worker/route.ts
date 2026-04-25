/**
 * Cron: b2b-voucher-dispatch-worker.
 *
 * Schedule: a cada 1min (cron `* * * * *`).
 *
 * Drena fila `b2b_voucher_dispatch_queue` (mig 800-06 + idempotency 800-08):
 *   0. resetStuck(5) · resgata items 'processing' presos > 5min (worker zombie,
 *      crash, deploy mid-flight). Loga warn + audit se reset > 0.
 *   1. pickPending(10) · marca items como 'processing' via FOR UPDATE SKIP LOCKED
 *      + SET processing_started_at (mig 800-08 · multi-worker safe).
 *   2. Pra cada item: chama RPC b2b_voucher_issue (via repos.b2bVouchers.issue)
 *      · OK   → voucherQueue.complete(queueId, voucherId)
 *      · erro → voucherQueue.fail(queueId, error) · retry < 3, senao 'failed'
 *      Idempotency guard (mig 800-08): complete/fail so atualizam WHERE
 *      status='processing'. Em ok=false (zumbi · status mudou), loga error
 *      + audit log pra investigacao manual (Sentry P2).
 *   3. Espaca 2s entre cada (anti-flood pra Mih nao saturar Evolution)
 *
 * Limite 10/min: hipotese conservadora. Se Mih segura mais (rate limit
 * Evolution), abrir aos poucos. Logs `voucher_dispatch.batch.processed`.
 *
 * NAO faz dispatch da mensagem pro recipient · isso fica no item 6 (bulk
 * WhatsApp) que monta o template + envia via Mih. Aqui SO emite voucher
 * (gera token + grava em b2b_vouchers · Lara/Mira/UI fazem o dispatch).
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { createLogger } from '@clinicai/logger'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'mira' }).child({ cron: 'b2b-voucher-dispatch-worker' })

const PICK_LIMIT = 10
const SPACING_MS = 2000
const STUCK_THRESHOLD_MIN = 5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  return runCron(req, 'b2b-voucher-dispatch-worker', async ({ repos, clinicId }) => {
    // Step 0 · circuit breaker (mig 800-08 anti-zumbi)
    // Resgata items processing travados > 5min antes de pickar mais.
    const reset = await repos.voucherQueue.resetStuck(STUCK_THRESHOLD_MIN)
    if (reset.resetCount > 0) {
      log.warn(
        {
          reset_count: reset.resetCount,
          threshold_minutes: reset.thresholdMinutes,
          items: reset.items,
        },
        'voucher_dispatch.reset_stuck',
      )
      // Audit log · investigacao manual depois (foi worker que travou? Crash?)
      try {
        await repos.waProAudit.logQuery({
          msg: {
            clinicId,
            phone: 'system:cron',
            direction: 'inbound',
            content: `voucher_dispatch.reset_stuck count=${reset.resetCount}`,
            intent: 'voucher_dispatch.reset_stuck',
            intentData: {
              reset_count: reset.resetCount,
              threshold_minutes: reset.thresholdMinutes,
              items: reset.items,
            },
            status: 'sent',
          },
          audit: {
            clinicId,
            phone: 'system:cron',
            query: 'b2b_dispatch_queue_reset_stuck',
            intent: 'voucher_dispatch.reset_stuck',
            rpcCalled: 'b2b_dispatch_queue_reset_stuck',
            success: true,
            resultSummary: `reset ${reset.resetCount} stuck items`,
          },
        })
      } catch {
        // best-effort
      }
    } else if (!reset.ok && reset.error) {
      log.error(
        { error: reset.error },
        'voucher_dispatch.reset_stuck_rpc_failed',
      )
    }

    const picked = await repos.voucherQueue.pickPending(PICK_LIMIT)

    if (picked.length === 0) {
      return { picked: 0, completed: 0, failed: 0, reset_stuck: reset.resetCount }
    }

    let completed = 0
    let failed = 0
    let guardHits = 0

    for (let i = 0; i < picked.length; i++) {
      const item = picked[i]
      try {
        const issueResult = await repos.b2bVouchers.issue({
          partnershipId: item.partnershipId,
          combo: item.combo ?? undefined,
          recipientName: item.recipientName,
          recipientPhone: item.recipientPhone,
          recipientCpf: item.recipientCpf ?? undefined,
          notes: item.notes ?? undefined,
        })

        if (issueResult.ok && issueResult.id) {
          const c = await repos.voucherQueue.complete(item.queueId, issueResult.id)
          if (c.ok) {
            completed++
            log.info(
              {
                queue_id: item.queueId,
                voucher_id: issueResult.id,
                token: issueResult.token,
                partnership_id: item.partnershipId,
                recipient_name: item.recipientName,
                batch_id: item.batchId,
              },
              'voucher_dispatch.item.completed',
            )
          } else {
            // Idempotency guard hit (mig 800-08) OR erro de rede.
            // CASO ZUMBI: voucher foi emitido (issueResult.ok=true · id existe)
            // mas queue item nao esta mais em 'processing' (foi resetado/cancelado).
            // Resultado: voucher orfao em b2b_vouchers SEM queue item done.
            // Acao: loga error + audit pra reconciliacao manual. NAO retenta fail()
            // porque fail() tambem checa status='processing' e vai falhar igual.
            guardHits++
            const isGuardHit = c.error === 'not_in_processing_state'
            log.error(
              {
                queue_id: item.queueId,
                voucher_id: issueResult.id,
                token: issueResult.token,
                partnership_id: item.partnershipId,
                recipient_name: item.recipientName,
                error: c.error,
                current_status: c.currentStatus,
                guard_hit: isGuardHit,
              },
              'voucher_dispatch.item.complete_guard_hit',
            )
            try {
              await repos.waProAudit.logQuery({
                msg: {
                  clinicId,
                  phone: item.recipientPhone || 'system:cron',
                  direction: 'inbound',
                  content: `voucher_dispatch.complete_guard_hit queue=${item.queueId} voucher=${issueResult.id}`,
                  intent: 'voucher_dispatch.complete_guard_hit',
                  intentData: {
                    queue_id: item.queueId,
                    voucher_id: issueResult.id,
                    current_status: c.currentStatus,
                    error: c.error,
                  },
                  status: 'failed',
                },
                audit: {
                  clinicId,
                  phone: item.recipientPhone || 'system:cron',
                  query: 'b2b_dispatch_queue_complete',
                  intent: 'voucher_dispatch.complete_guard_hit',
                  rpcCalled: 'b2b_dispatch_queue_complete',
                  success: false,
                  resultSummary: `voucher orfao · status=${c.currentStatus ?? 'unknown'}`,
                  errorMessage: c.error ?? 'complete_rpc_unknown_error',
                },
              })
            } catch {
              // best-effort
            }
          }
        } else {
          failed++
          const errMsg = issueResult.error ?? 'voucher_issue_unknown_error'
          const f = await repos.voucherQueue.fail(item.queueId, errMsg)
          if (!f.ok) {
            // fail() guard hit · status mudou entre o pick e o fail (race rara).
            guardHits++
            log.error(
              {
                queue_id: item.queueId,
                partnership_id: item.partnershipId,
                attempts: item.attempts,
                error: f.error,
                current_status: f.currentStatus,
                original_error: errMsg,
              },
              'voucher_dispatch.item.fail_guard_hit',
            )
            try {
              await repos.waProAudit.logQuery({
                msg: {
                  clinicId,
                  phone: item.recipientPhone || 'system:cron',
                  direction: 'inbound',
                  content: `voucher_dispatch.fail_guard_hit queue=${item.queueId}`,
                  intent: 'voucher_dispatch.fail_guard_hit',
                  intentData: {
                    queue_id: item.queueId,
                    current_status: f.currentStatus,
                    error: f.error,
                    original_error: errMsg,
                  },
                  status: 'failed',
                },
                audit: {
                  clinicId,
                  phone: item.recipientPhone || 'system:cron',
                  query: 'b2b_dispatch_queue_fail',
                  intent: 'voucher_dispatch.fail_guard_hit',
                  rpcCalled: 'b2b_dispatch_queue_fail',
                  success: false,
                  resultSummary: `fail bloqueado · status=${f.currentStatus ?? 'unknown'}`,
                  errorMessage: f.error ?? 'fail_rpc_guard_hit',
                },
              })
            } catch {
              // best-effort
            }
          } else {
            log.warn(
              {
                queue_id: item.queueId,
                partnership_id: item.partnershipId,
                attempts: item.attempts,
                new_status: f.newStatus,
                error: errMsg,
              },
              'voucher_dispatch.item.failed',
            )
          }
        }
      } catch (err) {
        failed++
        const errMsg = err instanceof Error ? err.message : String(err)
        try {
          await repos.voucherQueue.fail(item.queueId, `worker_exception:${errMsg}`)
        } catch (failErr) {
          log.error(
            { queue_id: item.queueId, err: failErr },
            'voucher_dispatch.item.fail_rpc_exception',
          )
        }
        log.error(
          {
            queue_id: item.queueId,
            partnership_id: item.partnershipId,
            err: errMsg,
          },
          'voucher_dispatch.item.exception',
        )
      }

      // Anti-flood: espaca 2s entre items (exceto apos o ultimo)
      if (i < picked.length - 1) {
        await sleep(SPACING_MS)
      }
    }

    log.info(
      {
        picked: picked.length,
        completed,
        failed,
        guard_hits: guardHits,
        reset_stuck: reset.resetCount,
      },
      'voucher_dispatch.batch.processed',
    )

    return {
      picked: picked.length,
      completed,
      failed,
      guard_hits: guardHits,
      reset_stuck: reset.resetCount,
    }
  })
}
