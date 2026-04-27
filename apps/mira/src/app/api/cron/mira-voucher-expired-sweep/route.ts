/**
 * Cron: mira-voucher-expired-sweep.
 *
 * Schedule: 02h SP diario (cron `0 5 * * *` UTC · madrugada · sem load).
 *
 * Pedido Alden 2026-04-27 (gap 4 da auditoria): vouchers com
 * valid_until < now() mas status ainda 'issued/delivered/opened' precisam
 * virar 'expired'. Esse cron varre + atualiza · trigger
 * trg_b2b_voucher_dispatch_on_status (mig 800-48 enriquecida) dispatcha
 * voucher_expired_partner automaticamente pra cada um.
 *
 * Limita 500 rows por tick · evita timeout.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-voucher-expired-sweep', async ({ supabase, clinicId }) => {
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('b2b_vouchers')
      .update({ status: 'expired', updated_at: nowIso })
      .eq('clinic_id', clinicId)
      .in('status', ['issued', 'delivered', 'opened'])
      .lt('valid_until', nowIso)
      .eq('is_demo', false)
      .select('id, partnership_id, recipient_name')
      .limit(500)

    if (error) {
      throw new Error(`expired-sweep update falhou: ${error.message}`)
    }

    const expired = data?.length ?? 0
    // Dispatch acontece automaticamente via trigger
    // _b2b_voucher_dispatch_on_status_change quando status='expired'
    return { itemsProcessed: expired, expired }
  })
}
