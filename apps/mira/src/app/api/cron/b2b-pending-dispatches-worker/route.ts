/**
 * Cron: b2b-pending-dispatches-worker.
 *
 * Schedule: a cada 1min (cron `* * * * *`).
 *
 * Drena fila `b2b_pending_dispatches` (mig 800-88) chamando RPC
 * `b2b_pending_dispatches_drain(p_limit)`. A RPC pega ate 50 items pending
 * cujo `scheduled_for <= now()` E `_b2b_is_within_business_hours(clinic_id)`
 * = true · marca processing · faz net.http_post pra edge · marca done/failed.
 *
 * O guard de horario fica DENTRO da RPC: items adiados (`reason='quiet_hours'`)
 * pelo trigger `_b2b_invoke_edge` esperam aqui ate cair na janela comercial
 * da clinica · ai o worker drena.
 *
 * Multi-worker safe: RPC usa FOR UPDATE SKIP LOCKED no pick. Idempotente.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export const dynamic = 'force-dynamic'

const PICK_LIMIT = 50

export async function GET(req: NextRequest) {
  return runCron(req, 'b2b-pending-dispatches-worker', async ({ supabase }) => {
    const { data, error } = await supabase.rpc('b2b_pending_dispatches_drain', {
      p_limit: PICK_LIMIT,
    })

    if (error) {
      throw new Error(`pending-dispatches drain falhou: ${error.message}`)
    }

    const result = (data ?? {}) as {
      ok?: boolean
      processed?: number
      failed?: number
      skipped?: number
    }

    return {
      itemsProcessed: result.processed ?? 0,
      processed: result.processed ?? 0,
      failed: result.failed ?? 0,
      skipped: result.skipped ?? 0,
    }
  })
}
