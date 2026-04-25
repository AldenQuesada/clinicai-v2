/**
 * Cron: mira-task-reminders.
 *
 * Schedule: every 5 min (cron `*\/5 * * * *`).
 * Notifica admin sobre tarefas vencidas/proximas do prazo.
 *
 * RPC esperado: `wa_pro_task_reminders`. Sem RPC: skip dispatch (evita risco
 * de re-envio · idempotencia precisa flag em DB).
 *
 * TODO P2: criar RPC canonica wa_pro_task_reminders se nao existir em prod.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText, tryRpcText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-task-reminders', async ({ supabase, repos, clinicId }) => {
    const text = await tryRpcText(supabase, 'wa_pro_task_reminders', { p_clinic_id: clinicId })

    if (!text) {
      return { tasks: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
    }

    const dispatch = await dispatchAdminText({
      supabase,
      repos,
      clinicId,
      eventKey: 'mira.cron.task_reminders',
      text,
    })

    return { tasks: 1, dispatched: dispatch }
  })
}
