/**
 * Tab "Vouchers" da parceria · lista vouchers em rows densos.
 * Mirror b2b-config.css `.bcfg-admin-row` pattern · grid denso ao inves de table.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const STATUS_LABEL: Record<string, string> = {
  issued: 'Emitido',
  delivered: 'Entregue',
  opened: 'Aberto',
  redeemed: 'Resgatado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

const STATUS_PILL: Record<string, string> = {
  issued: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  delivered: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  opened: 'bg-[#10B981]/15 text-[#10B981]',
  redeemed: 'bg-[#10B981]/15 text-[#10B981]',
  expired: 'bg-white/10 text-[#9CA3AF]',
  cancelled: 'bg-[#EF4444]/15 text-[#FCA5A5]',
}

export async function VouchersTab({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const vouchers = await repos.b2bVouchers.listByPartnership(partnershipId, 100)

  if (vouchers.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-[12.5px] text-[#9CA3AF]">
        Esta parceria ainda não tem vouchers emitidos.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {vouchers.map((v) => {
        const pill = STATUS_PILL[v.status] ?? 'bg-white/10 text-[#9CA3AF]'
        const label = STATUS_LABEL[v.status] ?? v.status
        return (
          <div
            key={v.id}
            className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors"
          >
            <span className="font-mono text-[11px] text-[#C9A96E]">{v.token}</span>

            <div className="min-w-0 flex flex-col gap-0.5">
              <span className="text-xs text-[#F5F0E8] truncate">
                {v.recipientName || '—'}
                {v.combo && (
                  <span className="ml-2 text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
                    {v.combo}
                  </span>
                )}
              </span>
              {v.recipientPhone && (
                <span className="text-[10.5px] font-mono text-[#9CA3AF]">
                  {v.recipientPhone}
                </span>
              )}
            </div>

            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
            >
              {label}
            </span>

            <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
              <span>emit {fmt(v.issuedAt)}</span>
              <span>até {fmt(v.validUntil)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return iso
  }
}
