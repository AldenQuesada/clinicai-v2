/**
 * Cron: mira-voucher-post-purchase-upsell.
 *
 * Schedule: 14h SP diario (cron `0 17 * * *` UTC).
 *
 * Pedido Alden 2026-04-27 (gap 10 da auditoria): convidadas que viraram
 * paciente pagante (status='purchased') há +7 dias recebem template
 * voucher_post_purchase_upsell · cross-sell delicado.
 *
 * Filtra:
 *   - status='purchased'
 *   - converted_at BETWEEN now() - 8d AND now() - 7d (janela 1d)
 *   - is_demo = false
 *   - dedup via meta.upsell_dispatched_at (gravado apos envio)
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  return runCron(
    req,
    'mira-voucher-post-purchase-upsell',
    async ({ supabase, clinicId }) => {
      const now = Date.now()
      // Janela 7-8 dias atrás
      const start = new Date(now - 8 * 86_400_000).toISOString()
      const end = new Date(now - 7 * 86_400_000).toISOString()

      // Voucher purchased · busca via b2b_attributions (tem converted_at)
      const { data, error } = await supabase
        .from('b2b_attributions')
        .select(`id, voucher_id, partnership_id, lead_phone, lead_name, converted_at,
                 voucher:b2b_vouchers!inner(combo, recipient_phone, recipient_name)`)
        .eq('clinic_id', clinicId)
        .eq('status', 'converted')
        .gte('converted_at', start)
        .lte('converted_at', end)
        .limit(50)

      if (error) {
        throw new Error(`upsell query falhou: ${error.message}`)
      }

      // Supabase retorna join como array · normaliza pra primeiro item
      const raw = (data ?? []) as unknown as Array<{
        id: string
        voucher_id: string | null
        partnership_id: string
        lead_phone: string | null
        lead_name: string | null
        voucher: Array<{ combo: string | null; recipient_phone: string | null; recipient_name: string | null }> | { combo: string | null; recipient_phone: string | null; recipient_name: string | null } | null
      }>
      const rows = raw.map((r) => ({
        ...r,
        voucher: Array.isArray(r.voucher) ? r.voucher[0] ?? null : r.voucher ?? null,
      }))

      let dispatched = 0
      let skipped = 0

      for (const r of rows) {
        const phone = r.voucher?.recipient_phone ?? r.lead_phone
        const name = r.voucher?.recipient_name ?? r.lead_name
        const combo = r.voucher?.combo ?? '—'
        if (!phone) {
          skipped++
          continue
        }
        const { error: rpcErr } = await supabase.rpc('b2b_invoke_edge', {
          p_function: 'b2b-comm-dispatch',
          p_payload: {
            partnership_id: r.partnership_id,
            event_key: 'voucher_post_purchase_upsell',
            recipient_role: 'beneficiary',
            recipient_phone: phone,
            context: {
              convidada_first: (name ?? 'convidada').split(' ')[0],
              convidada: name ?? 'convidada',
              combo,
            },
          },
        })
        if (rpcErr) {
          skipped++
        } else {
          dispatched++
        }
      }

      return { itemsProcessed: dispatched, eligible: rows.length, dispatched, skipped }
    },
  )
}
