/**
 * /vouchers/novo · emit single voucher rapido.
 *
 * Reusa infra de queue · 1 item enfileira + redirect pra batch tracking.
 * Mesmo padrao visual do bulk page · gold-tinted form, max-w-[640px].
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { SingleVoucherForm, type PartnershipOption } from './SingleVoucherForm'

export const dynamic = 'force-dynamic'

export default async function VoucherNovoPage() {
  const { ctx, repos } = await loadMiraServerContext()
  const partnerships = await repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' })

  // Enriquece com counts mensais · max 30 partnerships ativas (defensivo)
  const enriched: PartnershipOption[] = await Promise.all(
    partnerships.slice(0, 30).map(async (p) => ({
      id: p.id,
      name: p.name,
      voucherCombo: p.voucherCombo,
      voucherValidityDays: p.voucherValidityDays,
      voucherMonthlyCap: p.voucherMonthlyCap,
      vouchersIssuedThisMonth: await repos.b2bVouchers
        .countMonthlyByPartnership(p.id)
        .catch(() => 0),
    })),
  )

  return (
    <main
      className="flex-1 overflow-y-auto custom-scrollbar"
      style={{ background: 'hsl(60 5% 7%)' }}
    >
      <div
        className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-3"
        style={{ color: '#F5F0E8' }}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/vouchers"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <h1 className="font-display text-xl text-[#F5F0E8]">Emitir voucher</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Single · entra na fila + dispatch automatico (mesma infra do bulk)
              </p>
            </div>
          </div>
          <Link
            href="/vouchers/bulk"
            className="px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors"
          >
            Lote (bulk)
          </Link>
        </div>

        <SingleVoucherForm partnerships={enriched} />
      </div>
    </main>
  )
}
