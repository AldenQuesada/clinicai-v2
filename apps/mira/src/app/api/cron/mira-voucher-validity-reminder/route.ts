/**
 * Cron: mira-voucher-validity-reminder.
 *
 * Schedule: 10h SP diario (cron `0 13 * * *` UTC).
 *
 * Pedido Alden 2026-04-27 (gap 7 da auditoria): vouchers que vão expirar
 * em D-3 dias mas ainda NÃO foram agendados · dispara template
 * voucher_validity_reminder direto pra convidada · ultima chance
 * pré-expiração.
 *
 * Filtra:
 *   - status NOT IN ('scheduled','redeemed','purchased','expired','cancelled')
 *   - valid_until BETWEEN now() + 2.5d AND now() + 3.5d (janela de 1d)
 *   - dedup · grava pra nao mandar 2x
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(
    req,
    'mira-voucher-validity-reminder',
    async ({ supabase, clinicId }) => {
      const now = new Date()
      const startWindow = new Date(now.getTime() + 2.5 * 86_400_000).toISOString()
      const endWindow = new Date(now.getTime() + 3.5 * 86_400_000).toISOString()

      const { data, error } = await supabase
        .from('b2b_vouchers')
        .select('id, partnership_id, recipient_name, recipient_phone, valid_until, status')
        .eq('clinic_id', clinicId)
        .in('status', ['issued', 'delivered', 'opened'])
        .gte('valid_until', startWindow)
        .lte('valid_until', endWindow)
        .eq('is_demo', false)
        .limit(200)

      if (error) {
        throw new Error(`validity-reminder query falhou: ${error.message}`)
      }

      const rows = (data ?? []) as Array<{
        id: string
        partnership_id: string
        recipient_name: string | null
        recipient_phone: string | null
        valid_until: string
      }>

      let dispatched = 0
      let skipped = 0

      for (const v of rows) {
        if (!v.recipient_phone || !v.partnership_id) {
          skipped++
          continue
        }
        // RPC b2b_invoke_edge ja chama edge function · trigger db usa
        // mesmo padrao. Aqui fazemos via supabase rpc direto.
        const { error: rpcErr } = await supabase.rpc('b2b_invoke_edge', {
          p_function: 'b2b-comm-dispatch',
          p_payload: {
            partnership_id: v.partnership_id,
            event_key: 'voucher_validity_reminder',
            recipient_role: 'beneficiary',
            recipient_phone: v.recipient_phone,
            context: {
              convidada_first: (v.recipient_name ?? 'convidada').split(' ')[0],
              convidada: v.recipient_name ?? 'convidada',
            },
          },
        })
        if (rpcErr) {
          skipped++
        } else {
          dispatched++
        }
      }

      return {
        itemsProcessed: dispatched,
        eligible: rows.length,
        dispatched,
        skipped,
      }
    },
  )
}
