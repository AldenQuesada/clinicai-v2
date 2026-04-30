/**
 * Cron: b2b-admin-pending-worker.
 *
 * Schedule: a cada 1min.
 *
 * Drena rows `b2b_pending_dispatches` com edge_path='admin-direct-dispatch'
 * (enfileiradas por dispatchAdminText quando defer:true E fora do horario
 * comercial). Worker complementar do `b2b-pending-dispatches-worker` que
 * cobre apenas edge_path='b2b-comm-dispatch' via http_post.
 *
 * Fluxo:
 *   1. RPC b2b_admin_pending_pick(50) · marca rows como 'processing'
 *   2. Pra cada · reconstroi args + chama dispatchAdminText com
 *      bypassQuietHours=true (ja passou pelo guard, nao quer adiar de novo)
 *   3. RPC b2b_admin_pending_complete(id, 'done'|'failed', error?)
 *
 * Retry policy: attempts >= 3 marca 'failed' (admin investiga). Senao
 * volta pra 'pending' e tenta de novo.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText } from '@/lib/admin-dispatch'
import { createLogger } from '@clinicai/logger'

export const dynamic = 'force-dynamic'

const PICK_LIMIT = 50
const log = createLogger({ app: 'mira' }).child({ cron: 'b2b-admin-pending-worker' })

interface PendingItem {
  id: string
  clinic_id: string
  payload: {
    event_key?: string
    text?: string
    category?: string
    msg_key?: string
  }
  attempts: number
  source_event_key?: string | null
}

export async function GET(req: NextRequest) {
  return runCron(req, 'b2b-admin-pending-worker', async ({ supabase, repos }) => {
    const { data: pickRes, error: pickErr } = await supabase.rpc('b2b_admin_pending_pick', {
      p_limit: PICK_LIMIT,
    })

    if (pickErr) {
      throw new Error(`admin-pending pick falhou: ${pickErr.message}`)
    }

    const items: PendingItem[] = (pickRes?.items ?? []) as PendingItem[]
    if (items.length === 0) {
      return { itemsProcessed: 0, picked: 0, sent: 0, failed: 0 }
    }

    let sentTotal = 0
    let failedTotal = 0

    for (const item of items) {
      const text = item.payload?.text
      const eventKey = item.payload?.event_key ?? item.source_event_key ?? 'mira.admin.deferred'

      if (!text || text.trim().length === 0) {
        await supabase.rpc('b2b_admin_pending_complete', {
          p_id: item.id,
          p_status: 'failed',
          p_error: 'payload_missing_text',
        })
        failedTotal++
        continue
      }

      try {
        const result = await dispatchAdminText({
          supabase,
          repos,
          clinicId: item.clinic_id,
          eventKey,
          text,
          category: item.payload?.category as never,
          msgKey: item.payload?.msg_key,
          bypassQuietHours: true, // ja passou pelo guard antes de enfileirar
        })

        if (result.sent > 0 || result.recipients > 0) {
          await supabase.rpc('b2b_admin_pending_complete', {
            p_id: item.id,
            p_status: 'done',
            p_error: null,
          })
          sentTotal += result.sent
          if (result.failed > 0) failedTotal += result.failed
        } else {
          // Zero recipients · tratado como done (nada errado, ninguem pra mandar)
          await supabase.rpc('b2b_admin_pending_complete', {
            p_id: item.id,
            p_status: 'done',
            p_error: 'zero_recipients_after_filter',
          })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const finalStatus = item.attempts >= 3 ? 'failed' : 'retry'
        await supabase.rpc('b2b_admin_pending_complete', {
          p_id: item.id,
          p_status: finalStatus,
          p_error: errMsg.slice(0, 1000),
        })
        failedTotal++
        log.warn(
          { pending_id: item.id, attempts: item.attempts, error: errMsg },
          'admin_pending.dispatch_failed',
        )
      }
    }

    log.info(
      { picked: items.length, sent: sentTotal, failed: failedTotal },
      'admin_pending.batch_processed',
    )

    return {
      itemsProcessed: items.length,
      picked: items.length,
      sent: sentTotal,
      failed: failedTotal,
    }
  })
}
