/**
 * Cron: b2b-voucher-dispatch-worker.
 *
 * Schedule: a cada 1min (cron `* * * * *`).
 *
 * Drena fila `b2b_voucher_dispatch_queue` (mig 800-06):
 *   1. pickPending(10) · marca items como 'processing' via FOR UPDATE SKIP LOCKED
 *      (multi-worker safe · concorrencia segura)
 *   2. Pra cada item: chama RPC b2b_voucher_issue (via repos.b2bVouchers.issue)
 *      · OK   → voucherQueue.complete(queueId, voucherId)
 *      · erro → voucherQueue.fail(queueId, error) · retry < 3, senao 'failed'
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(req: NextRequest) {
  return runCron(req, 'b2b-voucher-dispatch-worker', async ({ repos }) => {
    const picked = await repos.voucherQueue.pickPending(PICK_LIMIT)

    if (picked.length === 0) {
      return { picked: 0, completed: 0, failed: 0 }
    }

    let completed = 0
    let failed = 0

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
            // complete falhou (race?) · marca fail pra registrar
            failed++
            await repos.voucherQueue.fail(
              item.queueId,
              `complete_rpc_failed:${c.error ?? 'unknown'}`,
            )
            log.warn(
              { queue_id: item.queueId, error: c.error },
              'voucher_dispatch.item.complete_failed',
            )
          }
        } else {
          failed++
          const errMsg = issueResult.error ?? 'voucher_issue_unknown_error'
          const f = await repos.voucherQueue.fail(item.queueId, errMsg)
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
      { picked: picked.length, completed, failed },
      'voucher_dispatch.batch.processed',
    )

    return { picked: picked.length, completed, failed }
  })
}
